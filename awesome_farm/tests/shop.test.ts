// The travelling trader and the waystones (sim/shop.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { ITEMS } from '../src/shared/data/items';
import { stockFor } from '../src/shared/sim/shop';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE, SimEvent } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, secs: number) => { for (let t = 0; t < secs; t += STEP) sim.step(STEP); };
const events = (sim: Sim) => { const e = sim.events; sim.events = []; return e; };
const floats = (ev: SimEvent[]) => ev.filter((e) => e.e === 'float').map((e) => (e as { text: string }).text);
const banners = (ev: SimEvent[]) => ev.filter((e) => e.e === 'banner').map((e) => (e as { text: string }).text);
const fxNames = (ev: SimEvent[]) => ev.filter((e) => e.e === 'fx').map((e) => (e as { fx: string }).fx);

function yard (seed: string) {
    const sim = Sim.create(seed, 'shop');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE;
    events(sim);
    return { sim, p, o };
}
const put = (sim: Sim, kind: BuildE['kind'], tx: number, ty: number, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind, tx, ty, rot: 0, by: 'a', ...extra });
/** Let the night fall and the next day dawn. */
function dawn (sim: Sim) {
    sim.s.clock = TUNING.dayLength + sim.s.nightLen - 0.05; sim.s.night = true;
    run(sim, 0.2);
}

test('the trader’s stock comes from the seed and the day: the same every time, a few plain things at first, more and dearer later', () => {
    const first = stockFor('SHOP', 1);
    assert.deepEqual(first, stockFor('SHOP', 1));
    assert.notDeepEqual(stockFor('SHOP', 1).stock, stockFor('OTHER', 1).stock);
    const early = new Set(['seed_wheat', 'seed_carrot', 'pod', 'potion_heal', 'potion_energy', 'bread', 'rope']);
    assert.equal(first.day, 1);
    assert.equal(first.stock.length, early.size, 'on the first day everything a new farmer could want, and nothing else');
    assert.deepEqual(new Set(first.stock.map((r) => r.item)), early);
    for (const row of first.stock) {
        assert.ok(row.n >= 1, `${row.item}: something to sell`);
        assert.ok(row.price >= 2 && row.price > ITEMS[row.item].sell, `${row.item}: never cheaper than the market pays`);
    }
    const later = stockFor('SHOP', 3);
    assert.equal(later.stock.length, 9, 'nine rows once the pool allows');
    assert.equal(new Set(later.stock.map((r) => r.item)).size, 9, 'each a different thing');
    for (let d = 1; d < 120; d++) for (const r of stockFor('SHOP', d).stock) assert.ok(r.price >= 2);
    // the same thing costs more as the days pass (up to day sixty)
    const price = (day: number, item: string) => stockFor('SHOP', day).stock.find((r) => r.item === item)?.price;
    let compared = 0;
    for (const r of stockFor('SHOP', 10).stock) { const p50 = price(50, r.item); if (p50 !== undefined) { assert.ok(p50 >= r.price, r.item); compared++; } }
    assert.ok(compared > 0);
    assert.ok(stockFor('SHOP', 1).stock.every((r) => r.item !== 'steel'), 'steel waits for the sixth day');
});

test('the world restocks every second dawn, keeps what was sold between, and a loaded world keeps its shop', () => {
    const sim = Sim.create('SHOP-2', 'shop');
    sim.join('a', 'A');
    assert.equal(sim.s.shop?.day, 1);
    assert.deepEqual(sim.s.shop, stockFor(sim.s.seed, 1));
    sim.s.shop!.stock[0].n = 1;
    dawn(sim);
    assert.equal(sim.s.day, 2);
    assert.equal(sim.s.shop!.day, 1, 'the second day sells from the same cart');
    assert.equal(sim.s.shop!.stock[0].n, 1, 'with what is left in it');
    dawn(sim);
    assert.equal(sim.s.day, 3);
    assert.equal(sim.s.shop!.day, 3, 'a fresh cart');
    assert.deepEqual(sim.s.shop, stockFor(sim.s.seed, 3));
    sim.s.shop!.stock[1].n = 0;
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.deepEqual(again.s.shop, sim.s.shop);
    again.s.day = 4;
    dawn(again);
    assert.equal(again.s.shop!.day, 5);
});

test('buying needs Merchant Contacts, a market close by, the coins and the stock; coins and stock go down by exactly the purchase', () => {
    const { sim, p, o } = yard('SHOP-3');
    put(sim, 'market', o.tx + 5, o.ty + 4);
    sim.command('a', { t: 'shop', i: 0, n: 1 });
    assert.ok(floats(events(sim)).includes('Learn Merchant Contacts to trade with the traveller'));
    p.skills.x_trade = 1;
    p.x = (o.tx + 12) * TILE;
    sim.command('a', { t: 'shop', i: 0, n: 1 });
    assert.ok(floats(events(sim)).includes('Stand next to a market'));
    p.x = (o.tx + 6) * TILE;
    const i = sim.s.shop!.stock.findIndex((r) => r.n >= 2);
    const row = sim.s.shop!.stock[i];
    p.coins = row.price * 2 - 1;
    sim.command('a', { t: 'shop', i, n: 2 });
    assert.ok(floats(events(sim)).includes(`Needs ${row.price * 2} coins`));
    assert.equal(countOf(p, row.item), 0);
    p.coins = row.price * 2;
    const n0 = row.n;
    sim.command('a', { t: 'shop', i, n: 2.5 });
    const ev = events(sim);
    assert.equal(p.coins, 0, 'two, not two and a half');
    assert.equal(row.n, n0 - 2);
    assert.equal(countOf(p, row.item), 2);
    assert.equal(p.cnt?.shop, 2);
    assert.ok(fxNames(ev).includes('sell') && floats(ev).includes(`-${row.price * 2} coins`));
    // more than the cart holds buys what is there; then it is sold out
    row.n = 1;
    p.coins = 100000;
    sim.command('a', { t: 'shop', i, n: 5 });
    assert.equal(row.n, 0);
    assert.equal(countOf(p, row.item), 3);
    assert.equal(p.coins, 100000 - row.price);
    sim.command('a', { t: 'shop', i, n: 1 });
    assert.ok(floats(events(sim)).includes('Sold out'));
    assert.equal(p.coins, 100000 - row.price);
    // junk from the wire does nothing
    for (const c of [{ i: -1, n: 1 }, { i: 'length' as never, n: 1 }, { i: 99, n: 1 }, { i: 0, n: 0 }, { i: 0, n: NaN }]) {
        const before = JSON.stringify([p.coins, p.inv, sim.s.shop]);
        sim.command('a', { t: 'shop', ...c });
        assert.equal(JSON.stringify([p.coins, p.inv, sim.s.shop]), before, JSON.stringify(c));
    }
});

test('using a waystone lists every stone in the world with who raised it, and opens the window', () => {
    const { sim, p, o } = yard('SHOP-ways');
    const b = sim.join('b', 'B')!;
    const mine = put(sim, 'waystone', o.tx + 6, o.ty + 4);
    const theirs = put(sim, 'waystone', o.tx + 10, o.ty + 10, { by: 'b' });
    const nobody = put(sim, 'waystone', o.tx + 14, o.ty + 2, { by: undefined });
    events(sim);
    sim.command('a', { t: 'use', id: mine.id });
    const ev = events(sim);
    const ways = ev.find((e) => e.e === 'ways');
    assert.ok(ways && ways.e === 'ways' && ways.to === 'a' && ways.from === mine.id);
    const list = ways.e === 'ways' ? ways.list : [];
    assert.deepEqual(list.map((w) => [w.id, w.by]), [[mine.id, 'A'], [theirs.id, 'B'], [nobody.id, undefined]]);
    for (const w of list) assert.equal(w.plot, sim.homePlot(p.slot).i, 'each knows its island');
    assert.ok(ev.some((e) => e.e === 'open' && e.ui === 'waystone' && e.id === mine.id));
    void b;
});

test('travel goes from the stone you stand at to another stone, with a six-second hum before the next trip', () => {
    const { sim, p, o } = yard('SHOP-travel');
    const here = put(sim, 'waystone', o.tx + 6, o.ty + 4);
    const there = put(sim, 'waystone', o.tx + 14, o.ty + 14);
    const box = put(sim, 'chest', o.tx + 8, o.ty + 4, { inv: {} });
    p.x = (o.tx + 12) * TILE;
    sim.command('a', { t: 'travel', to: there.id });
    assert.ok(floats(events(sim)).includes('Stand next to a waystone'));
    p.x = (o.tx + 6) * TILE;
    sim.command('a', { t: 'travel', to: box.id });
    sim.command('a', { t: 'travel', to: here.id });
    sim.command('a', { t: 'travel', to: 999999 });
    assert.equal(events(sim).length, 0, 'a chest, the same stone or nothing at all: no trip');
    const warp = p.warp;
    sim.command('a', { t: 'travel', to: there.id });
    const ev = events(sim);
    assert.ok(Math.abs(p.x - (there.tx + 0.5) * TILE) <= 2 * TILE && Math.abs(p.y - (there.ty + 2) * TILE) <= 2 * TILE, 'beside the far stone');
    assert.equal(p.warp, warp + 1);
    assert.ok(p.invuln >= 1, 'a moment of safety on arrival');
    assert.equal(fxNames(ev).filter((f) => f === 'summon').length, 2, 'a flash at each end');
    assert.ok(banners(ev).includes('Waystone'));
    run(sim, 5.9);
    sim.command('a', { t: 'travel', to: here.id });
    assert.ok(floats(events(sim)).includes('The stones are still humming'));
    run(sim, 0.2);
    sim.command('a', { t: 'travel', to: here.id });
    assert.ok(Math.abs(p.x - (here.tx + 0.5) * TILE) <= 2 * TILE, 'back again');
});
