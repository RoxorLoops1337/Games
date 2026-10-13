// Welcome back: a farmer who was away a while is told, in a few toasts, what needs them; a quick return says nothing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { DIGEST_AFTER, digestLines } from '../src/shared/sim/digest';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, SimEvent } from '../src/shared/sim/types';

const toasts = (sim: Sim) => sim.events.filter((e): e is Extract<SimEvent, { e: 'toast' }> => e.e === 'toast');

test('after a long absence the digest names the ripe crops and who is here; after a short one it is silent', () => {
    const sim = Sim.create('digest', 'd');
    const p = sim.join('a', 'Ann')!;
    sim.join('b', 'Bo');
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    sim.add<BuildE>({ k: 'bld', kind: 'bed', tx: o.tx + 5, ty: o.ty + 5, rot: 0, by: 'a', crop: 2, plant: 'seed_wheat' });
    p.x = (o.tx + 4) * TILE; p.y = (o.ty + 4) * TILE;
    sim.leave('a');
    assert.ok(p.left, 'the leave is remembered');
    sim.s.time += DIGEST_AFTER + 10;
    sim.events = [];
    sim.join('a', 'Ann');
    const t = toasts(sim).map((e) => e.text).join(' | ');
    assert.match(t, /Welcome back/);
    assert.match(t, /1 crop is ripe/);
    assert.match(t, /Here now: Bo/);
    assert.equal(p.left, undefined, 'told once');
    sim.leave('a');
    sim.events = [];
    sim.join('a', 'Ann');
    assert.equal(toasts(sim).filter((e) => /Welcome back/.test(e.text)).length, 0, 'a quick return says nothing');
});

test('days that passed are named', () => {
    const sim = Sim.create('digest2', 'd');
    const p = sim.join('a', 'Ann')!;
    sim.leave('a');
    sim.s.day += 2; sim.s.time += 50;
    const lines = digestLines(sim, p);
    assert.match(lines[0].text, /2 days have passed/);
});
