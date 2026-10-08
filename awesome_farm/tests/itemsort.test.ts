// Sorting and filtering item lists, and the numbers the seed window shows.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CROPS, SEED_IDS } from '../src/shared/data/buildings';
import { cropFacts, fmtSecs, rankCrops } from '../src/shared/data/cropfacts';
import { FILTER_CATS } from '../src/shared/data/filters';
import { ITEM_ORDER, ITEMS, ItemId } from '../src/shared/data/items';
import { cleanPrefs, DEFAULT_PREFS, filterItems, groupOf, nextSort, presentCats, SORT_MODES, sortItems } from '../src/shared/data/itemsort';

const some: ItemId[] = ['wood', 'iron', 'seed_wheat', 'bread', 'goldbar', 'stone', 'coal', 'carrot', 'sword_iron'].filter((i): i is ItemId => i in ITEMS);
const n = (id: ItemId) => ({ wood: 120, iron: 4, seed_wheat: 30, bread: 7, goldbar: 2, stone: 300, coal: 12, carrot: 9, sword_iron: 1 } as Record<string, number>)[id] ?? 1;

test('every sort mode returns the same things in a stable order, and reverse turns it round', () => {
    for (const m of SORT_MODES) {
        const a = sortItems(some, m.id, n), b = sortItems([...some].reverse(), m.id, n);
        assert.deepEqual(a, b, `${m.id}: the result does not depend on the order it came in`);
        assert.equal(a.length, some.length);
        assert.deepEqual(sortItems(some, m.id, n, true), [...a].reverse(), `${m.id}: reverse`);
    }
    assert.equal(sortItems(some, 'amount', n)[0], 'stone', 'the biggest pile first');
    assert.equal(sortItems(some, 'name', n)[0], some.map((i) => ITEMS[i].name).sort((x, y) => x.localeCompare(y)).map((nm) => some.find((i) => ITEMS[i].name === nm)!)[0]);
    const byValue = sortItems(some, 'value', n);
    for (let i = 1; i < byValue.length; i++) assert.ok(n(byValue[i - 1]) * ITEMS[byValue[i - 1]].sell >= n(byValue[i]) * ITEMS[byValue[i]].sell);
});

test('sorting by type groups the categories together, in the order the chips run', () => {
    const t = sortItems(ITEM_ORDER, 'type', () => 1);
    let last = -1;
    for (const id of t) { const g = groupOf(id); assert.ok(g >= last, `${id} (${g}) came after group ${last}`); last = g; }
    assert.equal(t.length, ITEM_ORDER.length);
});

test('a filter keeps only its category; the chips list only categories that have something', () => {
    for (const c of FILTER_CATS) for (const id of filterItems(ITEM_ORDER, c.id)) assert.ok(c.has(id));
    assert.deepEqual(filterItems(some, 'all'), some);
    assert.deepEqual(filterItems(some, 'no-such-category'), some, 'an unknown category shows everything');
    const present = presentCats(some);
    assert.ok(present.length >= 3 && present.every((p) => p.n > 0));
    assert.ok(present.some((p) => p.id === 'ore') && present.some((p) => p.id === 'seeds'));
    assert.ok(!presentCats(['wood']).some((p) => p.id === 'ore'));
});

test('stored preferences are made safe', () => {
    assert.deepEqual(cleanPrefs(undefined), DEFAULT_PREFS);
    assert.deepEqual(cleanPrefs({ sort: 'amount', reverse: true, cat: 'ore' }), { sort: 'amount', reverse: true, cat: 'ore' });
    assert.deepEqual(cleanPrefs({ sort: 'bogus', reverse: 'yes', cat: 'gone' }), DEFAULT_PREFS);
    assert.deepEqual(cleanPrefs('nonsense'), DEFAULT_PREFS);
    let m = SORT_MODES[0].id; const seen = new Set([m]);
    for (let i = 0; i < SORT_MODES.length; i++) { m = nextSort(m); seen.add(m); }
    assert.equal(seen.size, SORT_MODES.length, 'the Sort button visits every mode');
});

test('crop facts: the numbers move with the season and skills, and the ranking is sensible', () => {
    const base = { growMul: 1, seasonGrow: 1, seasonYield: 0, sellMul: 1 };
    const wheat = cropFacts('seed_wheat', base)!;
    assert.equal(wheat.secs, CROPS.seed_wheat!.stageSecs * 2);
    assert.equal(cropFacts('seed_wheat', { ...base, seasonGrow: 0.5 })!.secs, wheat.secs * 2, 'winter takes twice as long');
    assert.ok(cropFacts('seed_wheat', { ...base, seasonYield: 0.4 })!.avg > wheat.avg, 'autumn gives more');
    assert.ok(cropFacts('seed_wheat', { ...base, sellMul: 1.5 })!.coins > wheat.coins);
    assert.equal(cropFacts('wood', base), null, 'only seeds have facts');
    const all = SEED_IDS.map((id) => cropFacts(id, base)!);
    const r = rankCrops(all)!;
    assert.ok(all.find((c) => c.id === r.fastest)!.secs === Math.min(...all.map((c) => c.secs)));
    assert.ok(all.find((c) => c.id === r.best)!.perMin === Math.max(...all.map((c) => c.perMin)));
    assert.equal(rankCrops(all.slice(0, 1)), null);
    assert.equal(fmtSecs(14), '14s');
    assert.equal(fmtSecs(72), '1:12');
    assert.equal(fmtSecs(0), '1s');
});
