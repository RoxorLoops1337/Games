// The Blueprint Shelf: publish a layout, only the publisher takes it down, bad layouts are refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { cleanItems, SHELF_MAX } from '../src/shared/sim/shelf';
import { Sim } from '../src/shared/sim/sim';
import type { BlueprintItem, BuildE } from '../src/shared/sim/types';

function setup (seed: string) {
    const sim = Sim.create(seed, 'c');
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = b.x = (o.tx + 5) * TILE; a.y = b.y = (o.ty + 6) * TILE;
    const box = sim.add<BuildE>({ k: 'bld', kind: 'shelf', tx: o.tx + 5, ty: o.ty + 4, rot: 0 });
    return { sim, a, b, box };
}
const line: BlueprintItem[] = [{ kind: 'chest', dx: 0, dy: 0, rot: 0 }, { kind: 'inserter', dx: 1, dy: 0, rot: 0 }, { kind: 'furnace', dx: 2, dy: 0, rot: 0 }];

test('layouts are checked like a paste: known buildings, whole tiles, a sane size, no shared boxes', () => {
    assert.equal(cleanItems(line)?.length, 3);
    assert.equal(cleanItems([]), null);
    assert.equal(cleanItems([{ kind: 'nope', dx: 0, dy: 0, rot: 0 }]), null);
    assert.equal(cleanItems([{ kind: 'chest', dx: 0.5, dy: 0, rot: 0 }]), null);
    assert.equal(cleanItems([{ kind: 'chest', dx: 999, dy: 0, rot: 0 }]), null);
    assert.equal(cleanItems([{ kind: 'coffer', dx: 0, dy: 0, rot: 0 }]), null);
    assert.equal(cleanItems('plank'), null);
});

test('publishing puts it on the shelf for everyone; only the publisher takes it down', () => {
    const { sim, box } = setup('SHF-1');
    sim.command('a', { t: 'shelf', op: 'publish', id: box.id, name: 'Iron line', items: line });
    assert.equal(box.bps?.length, 1);
    assert.equal(box.bps![0].who, 'A');
    assert.equal(box.bps![0].items.length, 3);
    sim.command('b', { t: 'shelf', op: 'remove', id: box.id, sid: box.bps![0].sid });
    assert.equal(box.bps!.length, 1, 'b cannot remove a work of a');
    sim.command('a', { t: 'shelf', op: 'remove', id: box.id, sid: box.bps![0].sid });
    assert.equal(box.bps!.length, 0);
});

test('three per farmer and a full shelf stop more; a bad layout is refused', () => {
    const { sim, box } = setup('SHF-2');
    for (let i = 0; i < 5; i++) sim.command('a', { t: 'shelf', op: 'publish', id: box.id, name: `L${i}`, items: line });
    assert.equal(box.bps!.length, 3, 'three each');
    for (let i = 0; i < 6; i++) sim.command('b', { t: 'shelf', op: 'publish', id: box.id, name: `M${i}`, items: line });
    assert.equal(box.bps!.length, 6);
    sim.command('b', { t: 'shelf', op: 'publish', id: box.id, name: 'bad', items: [{ kind: 'zzz', dx: 0, dy: 0, rot: 0 }] as never });
    assert.equal(box.bps!.length, 6);
    assert.ok(SHELF_MAX >= 6);
});
