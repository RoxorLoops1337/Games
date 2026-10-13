// Bulk item tools: stars, Quick stack into nearby chests, Put all / Take all.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { Sim } from '../src/shared/sim/sim';
import { countOf } from '../src/shared/sim/stats';
import type { BuildE } from '../src/shared/sim/types';

function yard () {
    const sim = Sim.create('stash', 's');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.warp++; p.invuln = 9999; p.hearts = 99;
    const chest = (dx: number, dy: number, inv: BuildE['inv'] = {}, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + dx, ty: o.ty + dy, rot: 0, by: 'a', inv, ...extra });
    p.inv = { wood: 20, stone: 10, iron: 5 };
    return { sim, p, chest };
}

test('Quick stack puts things into chests that already hold them, and nothing else', () => {
    const { sim, p, chest } = yard();
    const c = chest(8, 6, { wood: 3 });
    const other = chest(4, 6, {});
    sim.command('a', { t: 'inv', op: 'stash' });
    assert.equal(countOf(p, 'wood'), 0);
    assert.equal(c.inv!.wood, 23);
    assert.equal(countOf(p, 'stone'), 10, 'no chest holds stone: it stays');
    assert.equal(other.inv!.wood, undefined);
});

test('starred and hotbar-pinned items stay, and a chest label counts as holding it', () => {
    const { sim, p, chest } = yard();
    const c = chest(8, 6, { wood: 1 }, { fl: ['#ore', 'wood'] });
    sim.command('a', { t: 'inv', op: 'fav', item: 'wood' });
    assert.deepEqual(p.fav, ['wood']);
    sim.command('a', { t: 'inv', op: 'stash' });
    assert.equal(countOf(p, 'wood'), 20, 'starred');
    assert.equal(countOf(p, 'iron'), 0, 'a chest labelled for ores takes the iron');
    assert.equal(c.inv!.iron, 5);
    sim.command('a', { t: 'inv', op: 'fav', item: 'wood' });
    assert.equal(p.fav, undefined, 'unstarred');
});

test('a chest far away is out of reach', () => {
    const { sim, p, chest } = yard();
    const c = chest(40, 6, { wood: 3 });
    sim.command('a', { t: 'inv', op: 'stash' });
    assert.equal(countOf(p, 'wood'), 20);
    assert.equal(c.inv!.wood, 3);
});

test('Put all respects stars and the label; Take all empties the chest into your pockets', () => {
    const { sim, p, chest } = yard();
    const c = chest(7, 6, {});
    sim.command('a', { t: 'inv', op: 'fav', item: 'iron' });
    sim.command('a', { t: 'inv', op: 'chest', id: c.id, dir: 'put' });
    assert.equal(countOf(p, 'wood'), 0);
    assert.equal(countOf(p, 'stone'), 0);
    assert.equal(countOf(p, 'iron'), 5, 'starred stays');
    sim.command('a', { t: 'inv', op: 'chest', id: c.id, dir: 'take' });
    assert.equal(countOf(p, 'wood'), 20);
    assert.equal(Object.values(c.inv ?? {}).reduce((a, n) => a + (n ?? 0), 0), 0);
});

test('Quick stack and Take all send a few flying items to the one who did it', () => {
    const { sim, p, chest } = yard();
    const c = chest(8, 6, { wood: 3, stone: 1 });
    sim.events = [];
    sim.command('a', { t: 'inv', op: 'stash' });
    const out = sim.events.filter((e) => e.e === 'fly');
    assert.ok(out.length >= 2 && out.length <= 10);
    assert.ok(out.every((e) => e.e === 'fly' && e.to === 'a' && e.d >= 0));
    sim.events = [];
    sim.command('a', { t: 'inv', op: 'chest', id: c.id, dir: 'take' });
    const back = sim.events.filter((e) => e.e === 'fly');
    assert.ok(back.length >= 2);
    assert.ok(countOf(p, 'wood') > 0);
});

test('Sell all shown sells every kind you list, but never starred or pinned ones, and only at a market', () => {
    const { sim, p, o } = (() => { const y = yard(); const o = y.sim.world.plotOrigin(y.sim.homePlot(y.p.slot)); return { ...y, o }; })();
    p.inv = { wood: 20, stone: 10, iron: 5 };
    sim.command('a', { t: 'inv', op: 'sellall', items: ['wood', 'stone', 'iron'] });
    assert.equal(countOf(p, 'wood'), 20, 'no market near: nothing sold');
    sim.add<BuildE>({ k: 'bld', kind: 'market', tx: o.tx + 7, ty: o.ty + 6, rot: 0, by: 'a' });
    sim.command('a', { t: 'inv', op: 'fav', item: 'iron' });
    const before = p.coins;
    sim.command('a', { t: 'inv', op: 'sellall', items: ['wood', 'stone', 'iron', 'wood'] });
    assert.equal(countOf(p, 'wood'), 0);
    assert.equal(countOf(p, 'stone'), 0);
    assert.equal(countOf(p, 'iron'), 5, 'starred stays');
    assert.ok(p.coins > before);
});
