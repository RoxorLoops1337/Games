// The Crafting and Build windows list only what you can use yet, so a new farmer is not overwhelmed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILD_CATS, BUILD_ORDER, BUILDINGS, type StationId } from '../src/shared/data/buildings';
import { SKILL_LIST } from '../src/shared/data/skills';
import { listedBuildCats, listedStations } from '../src/shared/sim/listed';
import { Sim } from '../src/shared/sim/sim';

const ALL: StationId[] = ['hand', 'workbench', 'anvil', 'kitchen', 'loom', 'alchemy'];
const learn = (p: { skills: Record<string, number> }, token: string) => {
    const node = SKILL_LIST.find((n) => n.unlock?.includes(token));
    assert.ok(node, `a skill grants ${token}`);
    p.skills[node.id] = 1;
};

test('a new farmer sees only their hands and the workbench; stations appear as you unlock or stand at them', () => {
    const sim = Sim.create('L-1', 'l');
    const p = sim.join('a', 'A')!;
    const none = () => false;
    assert.deepEqual(listedStations(p, ALL, none), ['hand', 'workbench']);
    assert.deepEqual(listedStations(p, ALL, (st) => st === 'kitchen'), ['hand', 'workbench', 'kitchen'], 'standing at one lists it');
    for (const [token, st] of [['smithing', 'anvil'], ['cooking', 'kitchen'], ['weaving', 'loom'], ['alchemy', 'alchemy']] as const) {
        assert.ok(!listedStations(p, ALL, none).includes(st), `${st} hidden at first`);
        learn(p, token);
        assert.ok(listedStations(p, ALL, none).includes(st), `${st} listed once ${token} is learned`);
    }
    assert.deepEqual(listedStations(p, ALL, none), ALL, 'in the same order as the full list');
});

test('Build lists a category only when something in it can be built', () => {
    const sim = Sim.create('L-2', 'l');
    const p = sim.join('a', 'A')!;
    const first = listedBuildCats(p);
    for (const need of ['craft', 'industry', 'farm', 'storage', 'light', 'home', 'decor', 'special'] as const) assert.ok(first.includes(need), `${need} is there from the start`);
    for (const hidden of ['logistics', 'power'] as const) {
        assert.ok(!first.includes(hidden), `${hidden} is hidden at first`);
        learn(p, hidden);
        assert.ok(listedBuildCats(p).includes(hidden), `${hidden} appears once learned`);
    }
    assert.deepEqual(listedBuildCats(p), BUILD_CATS.map((c) => c.id), 'order is kept');
    // a category with nothing you can build never shows
    for (const c of listedBuildCats(sim.join('b', 'B')!)) assert.ok(BUILD_ORDER.some((b) => BUILDINGS[b].cat === c));
});
