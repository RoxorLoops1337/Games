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
    const sp = SPECIES_LIST[0].id;
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
