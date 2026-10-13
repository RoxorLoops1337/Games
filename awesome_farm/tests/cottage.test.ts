// Cottages: a villager moves in at dawn, gives one gift a day, and gives more once they are a friend.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { FOLK_NAMES, FRIEND_AT, TRADES } from '../src/shared/data/folk';
import { onDawn, use } from '../src/shared/sim/cottage';
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
