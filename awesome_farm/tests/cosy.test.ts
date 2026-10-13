// Cosy rooms: the score counts furniture and variety; a furnished walled-in room gives the Cosy buff.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { COSY_AT, cosyScore, cosyValue, update } from '../src/shared/sim/cosy';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function room (seed: string) {
    const sim = Sim.create(seed, 'c');
    const p = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 9) * TILE; p.downed = 0;
    const put = (kind: BuildE['kind'], dx: number, dy: number) => sim.add<BuildE>({ k: 'bld', kind, tx: o.tx + 6 + dx, ty: o.ty + 8 + dy, rot: 0 });
    return { sim, p, put };
}

test('only furniture counts: decor, lights, a bed and a fire', () => {
    assert.equal(cosyValue('bench'), 1);
    assert.equal(cosyValue('lantern'), 1);
    assert.equal(cosyValue('sleepbed'), 3);
    assert.equal(cosyValue('furnace'), 0, 'machines are not furniture');
    assert.equal(cosyValue('wall_wood'), 0);
});

test('variety counts: two of one thing score less than two different things', () => {
    const a = room('COSY-1');
    a.put('bench', 0, 1); a.put('bench', 1, 1);
    const b = room('COSY-2');
    b.put('bench', 0, 1); b.put('lantern', 1, 1);
    assert.ok(cosyScore(b.sim, b.p.x, b.p.y) > cosyScore(a.sim, a.p.x, a.p.y));
});

test('a furnished walled-in room gives the Cosy buff; an open yard does not', () => {
    const { sim, p, put } = room('COSY-3');
    put('sleepbed', 1, 0); put('campfire', -1, 0); put('bench', 0, 1); put('lantern', 0, -1);
    assert.ok(cosyScore(sim, p.x, p.y) >= COSY_AT);
    sim.world.sealed = () => false;
    update(sim, 3);
    assert.ok(!p.buffs.some((b) => b.id === 'cosy'), 'open air is not a room');
    sim.world.sealed = () => true;
    update(sim, 3);
    assert.ok(p.buffs.some((b) => b.id === 'cosy'));
});
