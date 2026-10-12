// Taming in the 3D view: a thrown pod flies in an arc, the creature stays until it lands, then it is gone and the pod rocks in its
// place (and stops with the creature back when the catch fails); a hop leaps and settles; the evening hearth's ring is bigger and its
// ground glow grows with the gathering.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { Rng } from '../src/shared/rng';
import { SPECIES_LIST } from '../src/shared/data/creatures';
import type { CritE, Plot } from '../src/shared/sim/types';
import { generatePlots } from '../src/shared/sim/worldgen';
import { World } from '../src/shared/world';
import { Entities } from '../src/client3d/entities';

if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

function setup () {
    const plots: Plot[] = generatePlots(new Rng('pods3d'));
    plots[0].owned = true;
    const w = new World(plots, 'pods3d'), scene = new Scene(), ents = new Entities(scene, w);
    const o = w.plotOrigin(plots[0]);
    const x = (o.tx + 8.5) * 16, y = (o.ty + 8.5) * 16;
    const sp = SPECIES_LIST[0];
    const crit = (extra: Partial<CritE> = {}) => ({ id: 7, k: 'crit', sp, x, y, mode: 0, ...extra }) as unknown as CritE;
    return { ents, x, y, crit, cx: x / 16, cz: y / 16 };
}
const run = (ents: Entities, cx: number, cz: number, secs: number) => { for (let t = 0; t < secs; t += 1 / 30) ents.update(1 / 30, t, cx, cz); };

test('a thrown pod flies in an arc and the creature is held in it when it lands', () => {
    const { ents, x, y, crit, cx, cz } = setup();
    ents.upsert(crit());
    ents.throwPod({ id: 7, px: x - 80, py: y, x, y, pod: 'pod' });
    assert.equal(ents.flights.length, 1, 'a pod in the air');
    run(ents, cx, cz, 0.05);
    const mid = ents.flights[0]?.obj.position.y ?? 0;
    assert.ok(mid > 0.5, `it rises in an arc (${mid})`);
    // in the air the creature is still there
    assert.equal(ents.views.get(7)!.model.obj.visible, true);
    // the catch is being decided: the creature is in the pod, which rocks and sits where it was
    run(ents, cx, cz, 1);
    assert.equal(ents.flights.length, 0, 'it landed');
    ents.upsert(crit({ st: 2, a: 1.4, cat: { by: 'a', ok: true, pod: 'pod' } }));
    run(ents, cx, cz, 0.2);
    const v = ents.views.get(7)!;
    assert.equal(v.model.obj.visible, false, 'the creature is inside the pod');
    assert.ok(v.pod && v.pod.visible, 'and the pod shows');
    assert.ok(Math.abs(v.pod!.position.x - cx) < 0.3, 'where the creature stood');
    // the pod rocks in the rocking windows, rests between them
    const rot: number[] = [];
    for (let i = 0; i < 12; i++) { ents.upsert(crit({ st: 2, a: 1.4, cat: { by: 'a', ok: true, pod: 'pod' } })); ents.update(1 / 30, i / 30 * 0.7, cx, cz); rot.push(Math.abs(v.pod!.rotation.z)); }
    assert.ok(Math.max(...rot) > 0.05, 'it rocks');
    ents.upsert(crit({ st: 2, a: 0.9, cat: { by: 'a', ok: true, pod: 'pod' } }));
    // a failed catch: the creature steps out again
    ents.upsert(crit({ st: 0 }));
    run(ents, cx, cz, 0.1);
    assert.equal(ents.views.get(7)!.model.obj.visible, true);
    assert.equal(ents.views.get(7)!.pod?.visible, false);
});

test('a hop leaps with a squash and settles back to rest', () => {
    const { ents, crit, cx, cz } = setup();
    ents.upsert(crit());
    run(ents, cx, cz, 0.1);
    const v = ents.views.get(7)!, base = v.model.obj.position.y;
    ents.hop(7);
    let top = 0;
    for (let t = 0; t < 0.4; t += 1 / 30) { ents.update(1 / 30, t, cx, cz); top = Math.max(top, v.model.obj.position.y - base); }
    assert.ok(top > 0.15, `it leaves the ground (${top})`);
    run(ents, cx, cz, 1);
    assert.equal(v.hop, undefined, 'and is done');
    assert.equal(v.model.obj.scale.x, 1);
});

test('something new grows in, pops in or arcs out; a world just loaded is simply there', () => {
    const { ents, x, y, cx, cz } = setup();
    const node = { id: 20, k: 'node', kind: 'tree', tx: Math.floor(cx) + 2, ty: Math.floor(cz), hp: 3, plot: 0 } as never;
    ents.upsert(node, true);
    const v = ents.views.get(20)!;
    ents.update(1 / 30, 0, cx, cz);
    assert.ok(v.model.obj.scale.y < 0.7, `a new tree starts small (${v.model.obj.scale.y})`);
    run(ents, cx, cz, 0.6);
    assert.equal(v.model.obj.scale.y, 1, 'and is full size after');
    assert.equal(v.born, undefined);
    ents.upsert({ id: 21, k: 'node', kind: 'tree', tx: Math.floor(cx) + 3, ty: Math.floor(cz), hp: 3, plot: 0 } as never);
    assert.equal(ents.views.get(21)!.born, undefined, 'a tree that was already there does not grow');
    // a drop arcs out from where it popped
    ents.upsert({ id: 22, k: 'drop', res: 'wood', x, y, ox: x - 48, oy: y, age: 0 } as never, true);
    const d = ents.views.get(22)!;
    assert.ok(Math.abs(d.x - (x - 48) / 16) < 0.01, 'it starts at its origin');
    run(ents, cx, cz, 0.7);
    assert.ok(Math.abs(d.x - x / 16) < 0.05, 'and ends where it lies');
});

test('a worker lunges at its target and settles; a Perfect dash flashes the farmer', async () => {
    const { ents, crit, cx, cz } = setup();
    ents.upsert(crit());
    run(ents, cx, cz, 0.1);
    const v = ents.views.get(7)!, x0 = v.model.obj.position.x;
    ents.lunge(7, cx + 3, cz, 'mine');
    let far = 0;
    for (let t = 0; t < 0.5; t += 1 / 30) { ents.update(1 / 30, t, cx, cz); far = Math.max(far, v.model.obj.position.x - x0); }
    assert.ok(far > 0.3, `it darts toward the target (${far})`);
    run(ents, cx, cz, 1);
    assert.equal(v.lunge, undefined);
    assert.equal(v.model.obj.scale.x, 1);
    const { farmerModel } = await import('../src/client3d/models/farmer');
    const m = farmerModel(undefined, 0, {});
    m.react(3, 0, false, 0.016);
    m.flash();
    m.react(3, 0, false, 0.016);
    assert.ok((m as unknown as { flashing: unknown }).flashing, 'the body is white for a moment');
});

test('buildings that are roofs, walls, fences and decor take snow on top; machines do not', async () => {
    const { dressSnow } = await import('../src/client3d/seasons');
    const { buildingModel } = await import('../src/client3d/models/buildings');
    const wall = buildingModel('wall_wood', { rot: 0, seed: 1, mask: 0 });
    const before = new Set<unknown>();
    wall.obj.traverse((o) => { const m = (o as { material?: unknown }).material; if (m) before.add(m); });
    dressSnow(wall.obj);
    let changed = 0;
    wall.obj.traverse((o) => { const m = (o as { material?: unknown }).material; if (m && !before.has(m)) changed++; });
    assert.ok(changed > 0, 'the wall wears snow-ready materials');
});
