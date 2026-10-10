// The low-poly 3D view recovered from the prototype (src/client3d): every model builds without a GPU and animates, the model
// tables only name things the game has, and the showcase farmstead still goes down on the current rules through a real SimHost.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILDINGS } from '../src/shared/data/buildings';
import { SPECIES_LIST } from '../src/shared/data/creatures';
import { ITEMS } from '../src/shared/data/items';
import { MOBS } from '../src/shared/data/mobs';
import { NODES } from '../src/shared/data/nodes';
import type { Ent } from '../src/shared/sim/types';
import { buildingModel, TABLE } from '../src/client3d/models/buildings';
import { critterModel, SPECS as CRITTERS } from '../src/client3d/models/critters';
import { dropModel, SPECS as DROPS } from '../src/client3d/models/drops';
import { farmerModel } from '../src/client3d/models/farmer';
import { countTris } from '../src/client3d/models/kit';
import { MOB_MODEL_KINDS, mobModel } from '../src/client3d/models/mobs';
import { BUILD as NODE_MODELS, nodeModel } from '../src/client3d/models/nodes';
import { Local } from '../src/client3d/net';
import { stageShowcase } from '../src/client3d/showcase';

// A few building models paint a soft halo on a 2D canvas when they are first built: give node a stand-in that draws nothing.
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}


const items = ['coin', ...Object.keys(ITEMS)];

test('every building, node, monster, creature, item and the farmer has a model that builds and animates', () => {
    for (const kind of Object.keys(BUILDINGS)) {
        const m = buildingModel(kind, { rot: 1, seed: 3, mask: 5 });
        assert.ok(countTris(m.obj) > 0, `building ${kind}`);
        for (let i = 0; i < 3; i++) m.update?.(0.016, i * 0.016);
    }
    for (const kind of Object.keys(NODES)) {
        const m = nodeModel(kind, { biome: 'meadow', gold: true, seed: 2 });
        assert.ok(countTris(m.obj) > 0, `node ${kind}`);
        m.apply?.({ id: 1, k: 'node', kind, tx: 0, ty: 0, hp: 1, plot: 0 } as Ent & { k: 'node' });
        m.update?.(0.016, 1);
    }
    for (const kind of Object.keys(MOBS)) {
        const m = mobModel(kind, { elite: true, seed: 4 });
        assert.ok(countTris(m.obj) > 0, `monster ${kind}`);
        for (let i = 0; i < 3; i++) m.pose?.(i, true, 0.5, 0.016);
    }
    for (const sp of SPECIES_LIST) {
        const m = critterModel(sp, { seed: 5, stage: 2 });
        assert.ok(countTris(m.obj) > 0, `creature ${sp}`);
        for (let i = 0; i < 3; i++) m.pose?.(i, i < 2, i === 2, 0.016);
    }
    for (const id of items) {
        const m = dropModel(id);
        assert.ok(countTris(m.obj) > 0, `drop ${id}`);
        m.update?.(0.016, 1);
    }
    const f = farmerModel({ b: 2, l: 1, e: 1, m: 1 }, 3, { weapon: 'sword_iron', head: 'cap_cloth', body: 'mail_iron', bag: 'bag_pack' });
    assert.ok(countTris(f.obj) > 0);
    for (let i = 0; i < 5; i++) f.pose(0, 1, true, i / 5, false, 0.016);
});

test('a model is the same every time for the same input (cached bakes, seeded variety)', () => {
    const a = countTris(nodeModel('tree', { biome: 'bog', gold: false, seed: 7 }).obj);
    assert.equal(countTris(nodeModel('tree', { biome: 'bog', gold: false, seed: 7 }).obj), a);
    assert.equal(countTris(buildingModel('wall_brick', { rot: 0, seed: 1, mask: 10 }).obj), countTris(buildingModel('wall_brick', { rot: 0, seed: 1, mask: 10 }).obj));
});

test('the model tables only name things the game has', () => {
    const stale = (names: string[], known: string[]) => names.filter((n) => !known.includes(n));
    assert.deepEqual(stale(Object.keys(TABLE), Object.keys(BUILDINGS)), []);
    assert.deepEqual(stale(MOB_MODEL_KINDS, Object.keys(MOBS)), []);
    assert.deepEqual(stale(Object.keys(CRITTERS), [...SPECIES_LIST]), []);
    assert.deepEqual(stale(Object.keys(NODE_MODELS), Object.keys(NODES)), []);
    assert.deepEqual(stale(Object.keys(DROPS), items), []);
});

test('the showcase farmstead goes down on the current rules, through a real SimHost', () => {
    let placed = 0;
    const local = new Local('low-poly-farm', 'Sprout', (sim, p) => { placed = stageShowcase(sim, p).placed; });
    const msgs = local.poll(0);
    const welcome = msgs.find((m) => m.t === 'welcome');
    assert.ok(welcome && welcome.t === 'welcome' && welcome.state.players[welcome.you], 'welcomed with our farmer');
    assert.ok(placed >= 150, `placed ${placed}`);
    local.send({ t: 'move', x: 0, y: 0, fx: 0, fy: 1, moving: false });
    for (let i = 0; i < 10; i++) local.poll(0.1);
});

test('every action has a 3D burst (rerun scripts/gen-fx3d.ts when an action is added)', async () => {
    const { ACTIONS } = await import('../src/shared/actions');
    const { FX } = await import('../src/client3d/fx');
    const { RINGS } = await import('../src/client3d/impacts');
    const missing = ACTIONS.filter((a) => !(FX as Record<string, unknown>)[a]);
    assert.deepEqual(missing, []);
    for (const a of ['artHook', 'artArrow', 'artScorch', 'artShroud', 'artFrost', 'artRam']) assert.ok(RINGS[a], `${a} has a ring`);
});
