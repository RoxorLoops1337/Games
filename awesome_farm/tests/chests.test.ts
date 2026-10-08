// Dedicated chests: a chest can be set to take only some things and wear an icon. Players, inserters and creature workers all respect it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { chestIcon, cleanFilter, FILTER_CATS, filterCat, filterLabel, itemsOf, MAX_FILTER, names, takes, validIcon } from '../src/shared/data/filters';
import { ITEM_ORDER, ITEMS } from '../src/shared/data/items';
import { accepts, invDrop } from '../src/shared/sim/machines';
import { sortPlan } from '../src/shared/sim/jobs';
import { stashAt } from '../src/shared/sim/petlib';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function yard (seed: string) {
    const sim = Sim.create(seed, 'chests');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 6) * TILE; p.y = (o.ty + 6) * TILE; p.warp++; p.invuln = 9999; p.hearts = 99;
    const chest = (dx: number, dy: number, inv: BuildE['inv'] = {}, extra: Partial<BuildE> = {}) => sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + dx, ty: o.ty + dy, rot: 0, by: 'a', inv, ...extra });
    return { sim, p, o, chest };
}

test('the categories cover the catalogue sensibly, and every entry in them is a real item', () => {
    assert.ok(FILTER_CATS.length >= 10);
    for (const c of FILTER_CATS) {
        assert.ok(ITEMS[c.icon], `${c.id}: icon item exists`);
        assert.ok(c.name.length > 2 && c.name.length <= 16, `${c.id}: name fits a button (${c.name})`);
        assert.ok(c.desc.length > 10 && c.desc.length <= 90, `${c.id}: description`);
        const members = itemsOf(c.id);
        assert.ok(members.length >= 2, `${c.id}: has members`);
        assert.ok(c.has(c.icon), `${c.id}: its own icon belongs to it`);
    }
    // every item a player can hold is under at least one category, so "everything" can be built from them
    const orphans = ITEM_ORDER.filter((i) => !FILTER_CATS.some((c) => c.has(i)));
    assert.deepEqual(orphans, [], 'no item falls through every category');
    assert.ok(takes(['#ore'], 'iron') && takes(['#ore'], 'coal') && !takes(['#ore'], 'stone'));
    assert.ok(takes(['#stone'], 'stone') && takes(['#stone'], 'sand') && !takes(['#stone'], 'iron'));
    assert.ok(takes(['#seeds'], 'seed_wheat') && !takes(['#seeds'], 'wheat'));
    assert.ok(takes(['#fish'], 'fish_trout') && !takes(['#fish'], 'fish_pie') && takes(['#food'], 'fish_pie') && !takes(['#food'], 'fish_trout'));
    assert.ok(takes(['wood', '#seeds'], 'wood') && takes(['wood', '#seeds'], 'seed_corn') && !takes(['wood', '#seeds'], 'plank'));
    assert.ok(takes(undefined, 'iron') && takes([], 'iron'), 'no filter takes everything');
    assert.ok(names(['#ore'], 'iron') && !names([], 'iron') && !names(undefined, 'iron'), 'an open chest is nobody\'s home');
});

test('hostile filters are cleaned, capped and never throw', () => {
    assert.equal(cleanFilter('x'), null);
    assert.equal(cleanFilter(null), null);
    assert.equal(cleanFilter({ length: 3 }), null);
    assert.deepEqual(cleanFilter([]), []);
    assert.deepEqual(cleanFilter(['#ore', '#ore', 'iron', 'iron']), ['#ore', 'iron'], 'no repeats');
    assert.deepEqual(cleanFilter(['#nope', 'notanitem', '__proto__', 5, null, {}, ['#ore'], 'constructor', 'toString', '#__proto__']), []);
    assert.equal(cleanFilter(Array.from({ length: 500 }, (_, i) => (i % 2 ? 'iron' : '#' + FILTER_CATS[i % FILTER_CATS.length].id)))!.length <= MAX_FILTER, true);
    assert.equal(cleanFilter(ITEM_ORDER.slice(0, 80) as string[])!.length, MAX_FILTER);
    assert.equal(validIcon('iron'), true);
    for (const bad of ['', '__proto__', 'constructor', 5, null, undefined, {}, '#ore']) assert.equal(validIcon(bad), false);
    assert.equal(filterCat('__proto__'), undefined);
    assert.equal(takes(['#__proto__', '__proto__'], 'iron'), false);
});

test('a chest wears the icon it was given, or the first thing it takes', () => {
    assert.equal(chestIcon({}), null);
    assert.equal(chestIcon({ fl: ['#ore'] }), 'iron');
    assert.equal(chestIcon({ fl: ['wood', '#ore'] }), 'wood');
    assert.equal(chestIcon({ fl: ['#ore'], ic: 'goldbar' }), 'goldbar', 'a chosen icon wins');
    assert.equal(chestIcon({ ic: 'crystal' }), 'crystal', 'an icon with no filter is just a label');
    assert.equal(chestIcon({ ic: 'bogus' }), null);
    assert.equal(filterLabel(undefined), 'Everything');
    assert.equal(filterLabel(['#ore']), 'Ores');
    assert.equal(filterLabel(['#ore', 'wood']), 'Ores, Wood');
    assert.match(filterLabel(['#ore', '#seeds', 'wood', 'plank', 'stone']), /\+ 3 more$/);
});

test('players can only put in what a chest takes, and take out anything', () => {
    const { sim, p, chest } = yard('CH-1');
    const ores = chest(7, 6), open = chest(8, 6);
    sim.command('a', { t: 'config', id: ores.id, fl: ['#ore'] });
    assert.deepEqual(ores.fl, ['#ore']);
    assert.equal(open.fl, undefined);
    p.inv.iron = 20; p.inv.wood = 20; p.inv.coal = 5;
    sim.command('a', { t: 'xfer', id: ores.id, item: 'iron', n: 20, dir: 'put', part: 'inv' });
    sim.command('a', { t: 'xfer', id: ores.id, item: 'coal', n: 5, dir: 'put', part: 'inv' });
    sim.command('a', { t: 'xfer', id: ores.id, item: 'wood', n: 20, dir: 'put', part: 'inv' });
    assert.equal(ores.inv?.iron, 20); assert.equal(ores.inv?.coal, 5); assert.equal(ores.inv?.wood, undefined, 'wood is turned away');
    assert.equal(p.inv.wood, 20, 'and stays in the pockets');
    assert.ok(sim.events.some((e) => e.e === 'float' && /only takes ores/i.test(e.text)), 'with a word of explanation');
    sim.command('a', { t: 'xfer', id: open.id, item: 'wood', n: 20, dir: 'put', part: 'inv' });
    assert.equal(open.inv?.wood, 20, 'an open chest still takes anything');
    // changing the filter later never traps what is inside: it can still be taken out
    sim.command('a', { t: 'config', id: ores.id, fl: ['#seeds'] });
    sim.command('a', { t: 'xfer', id: ores.id, item: 'iron', n: 20, dir: 'take', part: 'inv' });
    assert.equal(ores.inv?.iron ?? 0, 0); assert.equal(p.inv.iron, 20);
    // and clearing it opens the chest again
    sim.command('a', { t: 'config', id: ores.id, fl: [] });
    assert.equal(ores.fl, undefined);
    p.inv.wood = 5;
    sim.command('a', { t: 'xfer', id: ores.id, item: 'wood', n: 5, dir: 'put', part: 'inv' });
    assert.equal(ores.inv?.wood, 5);
});

test('the config command is guarded: only chests, only in reach, only clean data', () => {
    const { sim, p, o, chest } = yard('CH-2');
    const c = chest(7, 6);
    const far = sim.add<BuildE>({ k: 'bld', kind: 'chest', tx: o.tx + 7, ty: o.ty + 6 + 12, rot: 0, by: 'a', inv: {} });
    const den = sim.add<BuildE>({ k: 'bld', kind: 'den', tx: o.tx + 4, ty: o.ty + 6, rot: 0, by: 'a', inv: {} });
    const bench = sim.add<BuildE>({ k: 'bld', kind: 'workbench', tx: o.tx + 5, ty: o.ty + 6, rot: 0, by: 'a' });
    sim.command('a', { t: 'config', id: far.id, fl: ['#ore'], ic: 'iron' });
    assert.equal(far.fl, undefined, 'out of reach changes nothing');
    sim.command('a', { t: 'config', id: den.id, fl: ['#ore'] });
    sim.command('a', { t: 'config', id: bench.id, fl: ['#ore'], ic: 'iron' });
    assert.equal(den.fl, undefined, 'a creature den is not a sorting chest'); assert.equal(bench.fl, undefined);
    for (const bad of [null, 5, 'x', { length: 2 }, ['__proto__'], [5, {}], 'iron'] as never[]) {
        assert.doesNotThrow(() => sim.command('a', { t: 'config', id: c.id, fl: bad }));
    }
    assert.equal(c.fl, undefined, 'junk sets nothing');
    sim.command('a', { t: 'config', id: c.id, ic: 'goldbar' });
    assert.equal(c.ic, 'goldbar');
    sim.command('a', { t: 'config', id: c.id, ic: '__proto__' });
    assert.equal(c.ic, 'goldbar', 'an unknown icon changes nothing');
    sim.command('a', { t: 'config', id: c.id, ic: null });
    assert.equal(c.ic, undefined, 'null clears it');
    sim.command('a', { t: 'config', id: c.id, fl: ['#ore', '#stone'], ic: 'iron' });
    assert.deepEqual(c.fl, ['#ore', '#stone']); assert.equal(c.ic, 'iron');
    void p;
});

test('inserters and machines only drop into a chest what it takes', () => {
    const { chest } = yard('CH-3');
    const c = chest(7, 6);
    assert.equal(accepts(c, 'iron'), 'inv');
    c.fl = ['#stone'];
    assert.equal(accepts(c, 'iron'), null);
    assert.equal(accepts(c, 'stone'), 'inv');
    assert.equal(accepts(c, 'sand'), 'inv');
    c.fl = ['iron'];
    assert.equal(accepts(c, 'copper'), null, 'iron the item is not "all ores"');
    assert.equal(accepts(c, 'iron'), 'inv');
});

test('creature workers put things in the chest meant for them, then an open one, and skip the rest', () => {
    const { sim, p, chest } = yard('CH-4');
    const seeds = chest(7, 6, {}, { fl: ['#seeds'] });
    const open = chest(9, 6);
    const ores = chest(8, 6, {}, { fl: ['#ore'] });
    const at = { x: p.x, y: p.y };
    assert.equal(stashAt(sim, at.x, at.y, 200, 'iron', 10), 10);
    assert.equal(ores.inv?.iron, 10, 'iron goes to the ore chest, though the open one is just as near');
    assert.equal(stashAt(sim, at.x, at.y, 200, 'wood', 10), 10);
    assert.equal(open.inv?.wood, 10, 'wood goes to the open chest: the seed and ore chests are not for it');
    assert.equal(seeds.inv?.wood, undefined);
    assert.equal(stashAt(sim, at.x, at.y, 200, 'seed_corn', 5), 5);
    assert.equal(seeds.inv?.seed_corn, 5);
    // with nothing to take it, it is not stashed (and spills if asked to)
    const lonely = yard('CH-4b');
    lonely.chest(7, 6, {}, { fl: ['#seeds'] });
    assert.equal(stashAt(lonely.sim, lonely.p.x, lonely.p.y, 200, 'wood', 4), 0);
});

test('sorters make the dedicated chests the home of their kind and tidy what does not belong', () => {
    const { chest } = yard('CH-5');
    const ores = chest(7, 6, { wood: 8 }, { fl: ['#ore'] });
    const seeds = chest(8, 6, {}, { fl: ['#seeds'] });
    const open = chest(9, 6, { iron: 30, seed_wheat: 6, plank: 3 });
    const stores = [ores, seeds, open];
    const apply = () => {
        const plan = sortPlan(stores);
        if (!plan) return false;
        invDrop(plan.from.inv!, plan.item, plan.n);
        plan.to.inv![plan.item] = (plan.to.inv![plan.item] ?? 0) + plan.n;
        return plan;
    };
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) { const r = apply(); if (!r) break; seen.push(`${r.item}:${r.from.id}->${r.to.id}`); }
    assert.equal(ores.inv?.iron, 30, `iron went to the ore chest (${seen.join(' ')})`);
    assert.equal(seeds.inv?.seed_wheat, 6, 'seeds went to the seed chest');
    assert.equal(ores.inv?.wood ?? 0, 0, 'the wood that was in the ore chest was taken out');
    assert.equal(open.inv?.wood, 8, '… and put in the open one');
    assert.equal(open.inv?.plank, 3, 'planks have nowhere dedicated, so they stay');
    assert.equal(sortPlan(stores), null, 'and it settles: nothing more to do, no going back and forth');
    // with no dedicated chests it behaves exactly as before
    const plain = yard('CH-5b');
    const a = plain.chest(7, 6, { wood: 9, stone: 2 }), b = plain.chest(8, 6, { stone: 9, wood: 1 });
    const plan = sortPlan([a, b])!;
    assert.ok(plan, 'a mixed pair of open chests still gets sorted');
});
