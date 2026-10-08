// The Uber Chest: every one in the world opens the same store, shared by the whole farm, and each one built adds room.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { SKILLS, UNLOCK_INFO } from '../src/shared/data/skills';
import { chestsAround, haveIn } from '../src/shared/sim/pool';
import { storesNear } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';
import { storageOf } from '../src/shared/sim/uber';

const PER = BUILDINGS.uberchest.storage!;

function yard (seed: string) {
    const sim = Sim.create(seed, 'uber');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.warp++; p.invuln = 9999; p.hearts = 99;
    const uber = (dx: number, dy: number) => sim.add<BuildE>({ k: 'bld', kind: 'uberchest', tx: o.tx + dx, ty: o.ty + dy, rot: 0, by: 'a', inv: {} });
    const stand = (b: BuildE) => { p.x = (b.tx + 0.5) * TILE; p.y = (b.ty + 2) * TILE; };
    return { sim, p, o, uber, stand };
}

test('it is unlocked by a skill, and the skill says so', () => {
    assert.equal(BUILDINGS.uberchest.req, 'uberchest');
    assert.ok(Object.values(SKILLS).some((n) => n.unlock?.includes('uberchest')), 'a skill node grants it');
    assert.ok(UNLOCK_INFO.uberchest.length > 10);
    assert.equal(BUILDINGS.uberchest.cat, 'storage');
});

test('every Uber Chest opens the same store, and each one adds room', () => {
    const { sim, p, uber, stand } = yard('U-1');
    const a = uber(2, 2), b = uber(14, 14);
    assert.equal(storageOf(a), PER * 2);
    assert.equal(storageOf(b), PER * 2);
    stand(a);
    p.inv.wood = 50;
    sim.command('a', { t: 'xfer', id: a.id, item: 'wood', n: 30, dir: 'put' });
    assert.equal(a.inv?.wood, 30);
    assert.equal(b.inv?.wood, 30, 'the far one holds it too');
    stand(b);
    sim.command('a', { t: 'xfer', id: b.id, item: 'wood', n: 10, dir: 'take' });
    assert.equal(a.inv?.wood, 20, 'taken out of the one store');
    assert.equal(p.inv.wood, 30);
    const c = uber(8, 2);
    assert.equal(storageOf(a), PER * 3, 'a third one: more room for all of them');
    assert.equal(c.inv?.wood, 20, 'and it opens the same store');
});

test('touching one marks them all as changed, so every client sees it', () => {
    const { sim, uber } = yard('U-2');
    const a = uber(2, 2), b = uber(10, 10);
    sim.dirty.clear();
    sim.touch(a);
    assert.ok(sim.dirty.has(a.id) && sim.dirty.has(b.id));
});

test('taking one down keeps the store; the last one gone keeps it for the next one', () => {
    const { sim, p, uber, stand } = yard('U-3');
    const a = uber(2, 2), b = uber(10, 10);
    a.inv!.iron = 40;
    stand(a);
    p.inv = {};
    sim.command('a', { t: 'demolish', id: a.id });
    assert.equal(sim.s.ents[a.id], undefined);
    assert.equal(b.inv?.iron, 40, 'the store did not spill out');
    assert.equal(storageOf(b), PER, 'less room now');
    stand(b);
    sim.command('a', { t: 'demolish', id: b.id });
    assert.equal(sim.s.uber?.inv.iron, 40, 'kept for later');
    const c = uber(5, 5);
    assert.equal(c.inv?.iron, 40, 'a new one opens it again');
});

test('a list of chests holds the shared store once: crafting and creatures never count it twice', () => {
    const { sim, p, uber } = yard('U-4');
    const a = uber(5, 5);
    uber(6, 5);
    a.inv!.plank = 12;
    p.inv = {};
    const near = chestsAround(Object.values(sim.s.ents), p.x, p.y);
    assert.equal(near.filter((c) => c.kind === 'uberchest').length, 1);
    assert.equal(haveIn(p, near, 'plank'), 12);
    assert.equal(storesNear(sim, p.x, p.y, 20 * TILE).filter((c) => c.kind === 'uberchest').length, 1);
});

test('a saved world comes back with every Uber Chest opening the one store', () => {
    const { sim, uber } = yard('U-5');
    const a = uber(2, 2);
    uber(9, 9);
    a.inv!.goldbar = 7;
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    const ubers = again.buildings('uberchest');
    assert.equal(ubers.length, 2);
    assert.equal(ubers[0].inv, ubers[1].inv, 'one store, not two copies');
    assert.equal(ubers[0].inv, again.s.uber!.inv);
    assert.equal(ubers[1].inv?.goldbar, 7);
    ubers[0].inv!.goldbar = 1;
    assert.equal(ubers[1].inv?.goldbar, 1);
    assert.equal(storageOf(ubers[1]), PER * 2);
});
