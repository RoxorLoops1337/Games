// The character creator: a look is a few small numbers, made safe by the sim, saved with the farmer and shown to everyone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BODY_TONES, cleanLook, cleanScarf, DEFAULT_LOOK, EYES, farmerKey, MOUTHS, randomLook, SCARF_COLORS, SPROUTS } from '../src/shared/data/look';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { Sim } from '../src/shared/sim/sim';

test('a look is made safe: whole numbers inside each range, anything else becomes the first choice or nothing', () => {
    assert.deepEqual(cleanLook({ b: 3, l: 4, e: 2, m: 1 }), { b: 3, l: 4, e: 2, m: 1 });
    assert.deepEqual(cleanLook({ b: 99, l: -1, e: 1.5, m: 'x' }), { b: 0, l: 0, e: 0, m: 0 });
    assert.deepEqual(cleanLook({}), DEFAULT_LOOK);
    for (const bad of [null, undefined, 5, 'look', [1, 2, 3, 4]]) assert.equal(cleanLook(bad), null);
    assert.equal(cleanScarf(3), 3);
    assert.equal(cleanScarf(8), 0);
    assert.equal(cleanScarf(NaN), 0);
    assert.equal(cleanScarf('2'), 0);
    // every choice has a name and a colour to show
    assert.equal(BODY_TONES.length, 8);
    assert.ok(SPROUTS.length >= 5 && EYES.length >= 4 && MOUTHS.length >= 4 && SCARF_COLORS.length === 8);
    const r = randomLook(() => 0.999);
    assert.deepEqual(cleanLook(r.look), r.look);
    assert.ok(r.color >= 0 && r.color < 8);
    assert.notEqual(farmerKey({ b: 1, l: 0, e: 0, m: 0 }, 0), farmerKey({ b: 0, l: 0, e: 0, m: 0 }, 0));
});

test('the look command changes the farmer, rejects nonsense, and others are told', () => {
    const sim = Sim.create('look-1', 'look');
    const a = sim.join('a', 'Ann')!;
    assert.equal(a.look, undefined, 'a new farmer has not chosen yet');
    sim.command('a', { t: 'look', look: { b: 2, l: 3, e: 1, m: 2 }, color: 5 });
    assert.deepEqual(a.look, { b: 2, l: 3, e: 1, m: 2 });
    assert.equal(a.color, 5);
    assert.ok(sim.events.some((e) => e.e === 'fx' && e.fx === 'look'), 'a spark of juice');
    sim.command('a', { t: 'look', look: { b: 1000, l: 0, e: 0, m: 0 } as never, color: -4 });
    assert.deepEqual(a.look, { b: 0, l: 0, e: 0, m: 0 }, 'out of range choices fall back');
    assert.equal(a.color, 0);
    sim.command('a', { t: 'look', look: 'nope' as never, color: 2 });
    assert.deepEqual(a.look, { b: 0, l: 0, e: 0, m: 0 }, 'a non-look changes nothing');
    sim.command('a', { t: 'look', look: { __proto__: { b: 1 }, b: 4, l: 1, e: 1, m: 1 } as never, color: 1 });
    const made = sim.s.players.a.look!;
    assert.ok(made.b >= 0 && made.b < 8);
});

test('everyone online sees a farmer look, and it survives a save', () => {
    const sim = Sim.create('look-2', 'look');
    const host = new SimHost(sim, 'Look');
    const got: Record<string, ServerMsg[]> = { a: [], b: [] };
    const peers: Record<string, Peer> = {};
    for (const id of ['a', 'b']) {
        peers[id] = { send: (text) => { got[id].push(JSON.parse(text)); } };
        host.attach(peers[id]);
        host.receive(peers[id], JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: id.toUpperCase() }));
    }
    host.update(0.2);
    host.receive(peers.a, JSON.stringify({ t: 'cmd', c: { t: 'look', look: { b: 5, l: 1, e: 3, m: 3 }, color: 6 } }));
    host.update(0.3); host.update(0.3);
    const ticks = got.b.filter((m): m is TickMsg => m.t === 'tick');
    const told = ticks.flatMap((t) => t.players).filter((d) => d.id === 'a' && d.look);
    assert.ok(told.length > 0 && told[told.length - 1].look!.b === 5, 'the other farmer is told');
    const again = new Sim(JSON.parse(JSON.stringify(sim.s)));
    assert.deepEqual(again.s.players.a.look, { b: 5, l: 1, e: 3, m: 3 });
    assert.equal(again.s.players.a.color, 6);
});
