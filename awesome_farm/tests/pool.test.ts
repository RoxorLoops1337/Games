// Crafting reaches into the chests next to you: pockets first, then the nearest chests; nothing from far away.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { RECIPES } from '../src/shared/data/recipes';
import { affordIn, chestsAround, haveIn, payFrom, POOL_RADIUS, timesIn } from '../src/shared/sim/pool';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function bench (seed: string) {
    const sim = Sim.create(seed, 'p');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.invuln = 9999; p.hearts = 99;
    sim.add<BuildE>({ k: 'bld', kind: 'workbench', tx: o.tx + 7, ty: o.ty + 6, rot: 0 });
    const chest = (dx: number, dy: number, inv: BuildE['inv'] = {}) => sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + dx, ty: o.ty + dy, rot: 0, inv });
    return { sim, p, o, chest };
}
const plank = RECIPES['workbench:plank'];

test('a workbench crafts from the chest beside it, pockets first', () => {
    const { sim, p, chest } = bench('PL-1');
    const near = chest(9, 6, { wood: 20 });
    p.inv.wood = 2;
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 5 });
    assert.equal(p.inv.plank, 5 * plank.n, 'five rounds of planks');
    assert.equal(p.inv.wood ?? 0, 0, 'the pockets went first');
    assert.equal(near.inv?.wood, 20 - (5 * (plank.in.wood ?? 0) - 2), 'the rest came out of the chest');
    assert.ok(sim.events.some((e) => e.e === 'float' && /chests/.test(e.text)), 'and the player is told');
});

test('chests that are too far away, or the wrong stuff, change nothing', () => {
    const { sim, p, chest } = bench('PL-2');
    const far = chest(6 + 12, 6, { wood: 50 });
    sim.command('a', { t: 'craft', recipe: 'workbench:plank', n: 5 });
    assert.equal(p.inv.plank ?? 0, 0, 'twelve tiles away is too far');
    assert.equal(far.inv?.wood, 50);
    assert.deepEqual(chestsAround(Object.values(sim.s.ents), p.x, p.y).map((c) => c.id), [], 'none in reach');
    assert.ok(POOL_RADIUS >= 6 * TILE && POOL_RADIUS <= 10 * TILE);
    // still needs the station itself
    const away = Sim.create('PL-2b', 'p'); const q = away.join('a', 'A')!;
    q.inv.wood = 10;
    away.command('a', { t: 'craft', recipe: 'workbench:plank', n: 1 });
    assert.equal(q.inv.plank ?? 0, 0, 'no workbench, no planks');
});

test('several chests share the load, nearest first; coins stay in the pockets', () => {
    const { sim, p, chest } = bench('PL-3');
    const close = chest(8, 8, { wood: 3 });
    const further = chest(12, 8, { wood: 30 });
    const chests = chestsAround(Object.values(sim.s.ents), p.x, p.y);
    assert.deepEqual(chests.map((c) => c.id), [close.id, further.id], 'nearest first');
    assert.equal(haveIn(p, chests, 'wood'), 33);
    assert.equal(haveIn(p, chests, 'coin'), p.coins, 'coins are only ever pockets');
    assert.ok(affordIn(p, chests, { wood: 33 }) && !affordIn(p, chests, { wood: 34 }));
    assert.equal(timesIn(p, chests, { wood: 4 }), 8);
    const touched = payFrom(p, chests, { wood: 10 });
    assert.equal(close.inv?.wood ?? 0, 0); assert.equal(further.inv?.wood, 23);
    assert.deepEqual(touched.map((c) => c.id), [close.id, further.id]);
    p.coins = 50;
    payFrom(p, chests, { coin: 20 });
    assert.equal(p.coins, 30);
});

test('hostile craft requests still do nothing', () => {
    const { sim, p, chest } = bench('PL-4');
    const near = chest(9, 6, { wood: 20 });
    for (const bad of [{ recipe: '__proto__', n: 1 }, { recipe: 'workbench:plank', n: NaN }, { recipe: 'workbench:plank', n: -5 }, { recipe: 5, n: 1 }, { recipe: 'workbench:plank', n: 1e9 }] as never[]) {
        assert.doesNotThrow(() => sim.command('a', { t: 'craft', ...(bad as object) } as never));
    }
    assert.ok((near.inv?.wood ?? 0) >= 20 - 25 * (plank.in.wood ?? 0), 'at most 25 rounds, whatever was asked');
    assert.ok((p.inv.plank ?? 0) <= 25 * plank.n);
});
