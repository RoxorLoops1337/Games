// The Build menu's "how to use" lines and tiny example plans, and the hover tooltip's one-line roles.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extent } from '../src/shared/blueprint';
import { BUILDINGS, type BuildingKind } from '../src/shared/data/buildings';
import { HOWTO } from '../src/shared/data/howto';
import { ITEMS } from '../src/shared/data/items';
import { TUNNEL_RANGE } from '../src/shared/sim/factory';
import { SUPPLY, WIRE_RANGE } from '../src/shared/sim/power';
import { RECIPES } from '../src/shared/data/recipes';

test('every logistics, power and industry building (and the chests) says what it does and how to use it', () => {
    const kinds = (Object.keys(BUILDINGS) as BuildingKind[]).filter((k) => ['logistics', 'power', 'industry'].includes(BUILDINGS[k].cat) || k === 'chest' || k === 'steelchest');
    assert.ok(kinds.length >= 16);
    for (const k of kinds) {
        const h = HOWTO[k];
        assert.ok(h, `${k} needs an entry in HOWTO`);
        assert.ok(h.role.length >= 10 && h.role.length <= 48, `${k}: role fits a tooltip line (${h.role.length})`);
        assert.ok(h.how.length >= 40 && h.how.length <= 140, `${k}: the how-to is one line (${h.how.length}): ${h.how}`);
        assert.ok(!/[{}]/.test(h.how), `${k}: no stray template braces`);
    }
    for (const k of Object.keys(HOWTO)) assert.ok(BUILDINGS[k as BuildingKind], `${k} is a real building`);
});

test('the example plans are real: known pieces, no overlaps, captions on real pieces, small enough for the menu', () => {
    let withExample = 0;
    for (const [k, h] of Object.entries(HOWTO)) {
        if (!h.example) continue;
        withExample++;
        const taken = new Set<string>();
        for (const it of h.example.items) {
            const def = BUILDINGS[it.kind];
            assert.ok(def, `${k}: ${it.kind} exists`);
            for (let y = 0; y < def.size[1]; y++) for (let x = 0; x < def.size[0]; x++) {
                const key = `${it.dx + x},${it.dy + y}`;
                assert.ok(!taken.has(key), `${k}: pieces overlap at ${key}`);
                taken.add(key);
            }
            if (it.flt) assert.ok(ITEMS[it.flt], `${k}: filter`);
            if (it.sel) assert.ok(RECIPES[it.sel], `${k}: recipe`);
        }
        const box = extent(h.example.items);
        assert.ok(box.w <= 7 && box.h <= 3, `${k}: ${box.w}×${box.h} fits under the description`);
        for (const m of h.example.marks) assert.ok(m.i >= 0 && m.i < h.example.items.length && m.t.length <= 14, `${k}: caption "${m.t}"`);
        assert.ok(h.example.items.some((it) => it.kind === k || ['belt', 'drill', 'windturbine', 'solar'].includes(it.kind)), `${k}: the example shows the thing itself or what feeds it`);
    }
    assert.ok(withExample >= 12, `most entries come with a picture (${withExample})`);
});

test('the numbers in the how-to lines are the ones the rules use', () => {
    assert.ok(HOWTO.tunnel!.how.includes(`${TUNNEL_RANGE} tiles`) && HOWTO.tunnelx!.how.includes(`${TUNNEL_RANGE} tiles`));
    assert.ok(HOWTO.pole!.how.includes(`${SUPPLY} tiles`) && HOWTO.pole!.how.includes(`${WIRE_RANGE} tiles`));
    assert.ok(HOWTO.windturbine!.how.includes(`${BUILDINGS.windturbine.gen} units`));
    assert.ok(HOWTO.coalgen!.how.includes(`${BUILDINGS.coalgen.gen} units`));
    assert.ok(HOWTO.chest!.how.includes(`${BUILDINGS.chest.storage}`) && HOWTO.steelchest!.how.includes(`${BUILDINGS.steelchest.storage}`));
});
