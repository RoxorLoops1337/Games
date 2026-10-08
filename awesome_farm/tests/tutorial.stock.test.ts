// The coach counts what is in the chests beside you, as the Build menu does: it must not say "you need wood" when the wood is in a chest.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { lacking, nearFacts, type TutorialView } from '../src/shared/data/tutorial';
import { takeItem } from '../src/shared/sim/stats';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

test('wood in a chest beside you counts for the coach; a chest across the island does not', () => {
    const sim = Sim.create('stock', 'x');
    const p = sim.join('a', 'A')!;
    takeItem(p, 'wood', 9999);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + 8, ty: o.ty + 8, rot: 0, by: 'a', inv: { wood: 6 } });
    const view = (): TutorialView => ({ me: p, base: {}, clock: { clock: 0, night: false }, ui: { walked: 0, opened: [], placing: null }, near: nearFacts(Object.values(sim.s.ents), { x: p.x, y: p.y }), price: null });

    p.x = (o.tx + 9) * TILE; p.y = (o.ty + 9) * TILE;
    assert.equal(lacking(view(), { wood: 3 }), null, 'the chest beside you has the wood');
    assert.deepEqual(lacking(view(), { wood: 8 }), { res: 'wood', need: 8, have: 6 });

    p.x = (o.tx + 40) * TILE;
    const far = lacking(view(), { wood: 3 });
    assert.equal(far?.have, 0, 'a chest that far away does not count');
});
