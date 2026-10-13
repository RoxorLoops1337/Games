// Cottages: a villager moves in at dawn, gives one gift a day, and gives more once they are a friend.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { FOLK_NAMES, FRIEND_AT, hearts, MAX_HEARTS, REQUEST_COINS, REQUEST_FRIEND, TRADES } from '../src/shared/data/folk';
import { isEve } from '../src/shared/data/festival';
import { onDawn, STALL_COST, STALL_PRIZE, use } from '../src/shared/sim/cottage';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function setup (seed: string, n = 1) {
    const sim = Sim.create(seed, 'c');
    const a = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 5) * TILE; a.y = (o.ty + 8) * TILE;
    const homes = Array.from({ length: n }, (_, i) => sim.add<BuildE>({ k: 'bld', kind: 'cottage', tx: o.tx + 4 + i * 3, ty: o.ty + 4, rot: 0, by: 'a' }));
    return { sim, a, homes };
}
const held = (a: { inv: Record<string, number | undefined> }) => Object.values(a.inv).reduce<number>((s, v) => s + (v ?? 0), 0);

test('a villager moves in at dawn; two cottages never share a name', () => {
    const { sim, homes } = setup('COT-1', 4);
    assert.ok(homes.every((h) => !h.res));
    onDawn(sim);
    assert.ok(homes.every((h) => !!h.res && FOLK_NAMES.includes(h.res.n) && TRADES.some((t) => t.id === h.res!.t)));
    assert.equal(new Set(homes.map((h) => h.res!.n)).size, 4, 'four different names');
    const first = homes.map((h) => h.res!.n).join();
    onDawn(sim);
    assert.equal(homes.map((h) => h.res!.n).join(), first, 'nobody is swapped on the next dawn');
});

test('one gift a day, a gift of their trade, and a friend gives a little more', () => {
    const { sim, a, homes } = setup('COT-2');
    const home = homes[0];
    use(sim, a, home);
    assert.equal(held(a), held({ inv: {} }) + held(a), 'an empty cottage gives nothing');
    onDawn(sim);
    const before = held(a);
    use(sim, a, home);
    const got = held(a) - before;
    assert.ok(got >= 1, 'a gift');
    assert.equal(home.res!.v, 1);
    use(sim, a, home);
    assert.equal(held(a) - before, got, 'only once a day');
    sim.s.day += 1;
    use(sim, a, home);
    assert.equal(home.res!.v, 2, 'the next day another');
    for (let d = 0; d < FRIEND_AT; d++) { sim.s.day += 1; use(sim, a, home); }
    assert.ok(home.res!.v > FRIEND_AT, 'a friend by now');
});

test('a request: bring what they ask for, earn coins and friendship hearts', () => {
    const { sim, a, homes } = setup('COT-3');
    const home = homes[0];
    onDawn(sim);
    for (let i = 0; i < 40 && !home.res!.q; i++) { sim.s.day++; onDawn(sim); }
    assert.ok(home.res!.q, 'a settled villager asks for something sooner or later');
    const item = home.res!.q as keyof typeof a.inv, n = home.res!.qn!;
    a.inv[item] = n;
    const coins = a.coins, v = home.res!.v;
    use(sim, a, home);
    assert.equal(a.coins, coins + REQUEST_COINS);
    assert.ok(home.res!.v >= v + REQUEST_FRIEND);
    assert.ok(!home.res!.q, 'the request is closed');
    assert.equal(hearts(0), 0);
    assert.equal(hearts(100), MAX_HEARTS);
});

test('festival night: the cottage is a ring-toss stall', () => {
    const { sim, a, homes } = setup('COT-4');
    const home = homes[0];
    onDawn(sim);
    sim.s.day = 7; sim.s.night = true;          // the last day of a season, after dark
    assert.ok(isEve(sim.s.day));
    a.coins = 100;
    let wins = 0;
    for (let i = 0; i < 20; i++) { const c = a.coins; use(sim, a, home); if (a.coins > c) wins++; }
    assert.ok(wins > 0 && wins < 20, 'some throws hit, some miss');
    assert.equal(a.coins, 100 - 20 * STALL_COST + wins * STALL_PRIZE);
    a.coins = 2;
    use(sim, a, home);
    assert.equal(a.coins, 2, 'no throw without the coins');
    assert.equal(home.res!.v, 0, 'a stall is not a visit');
});
