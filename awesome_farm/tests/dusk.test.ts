// The Long Dusk: the beacon sleeps until every boss has fallen, then toggles tougher monsters on and off.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE, TUNING } from '../src/shared/config';
import { BOSS_ORDER } from '../src/shared/data/mobs';
import { unlocked } from '../src/shared/sim/dusk';
import * as mobs from '../src/shared/sim/mobs';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE } from '../src/shared/sim/types';

function setup (seed: string) {
    const sim = Sim.create(seed, 'c');
    const a = sim.join('a', 'A')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 5) * TILE; a.y = (o.ty + 9) * TILE;
    const beacon = sim.add<BuildE>({ k: 'bld', kind: 'beacon', tx: o.tx + 5, ty: o.ty + 7, rot: 0 });
    return { sim, a, beacon, o };
}
const spawn = (sim: Sim, x: number, y: number) => mobs.spawnMob(sim, 'slime', undefined, undefined, { x, y, elite: false })!;

test('the beacon sleeps until every boss has fallen', () => {
    const { sim, beacon } = setup('DUSK-1');
    assert.equal(unlocked(sim), false);
    sim.command('a', { t: 'use', id: beacon.id });
    assert.ok(!sim.s.dusk, 'still dark');
    sim.s.bosses = Object.fromEntries(BOSS_ORDER.slice(0, -1).map((id) => [id, 1]));
    assert.equal(unlocked(sim), false, 'one short');
    sim.s.bosses = Object.fromEntries(BOSS_ORDER.map((id) => [id, 1]));
    assert.equal(unlocked(sim), true);
});

test('lit, monsters are tougher by the tuned number of levels; put out, they are as they were', () => {
    const { sim, beacon, o } = setup('DUSK-2');
    sim.s.bosses = Object.fromEntries(BOSS_ORDER.map((id) => [id, 1]));
    const x = (o.tx + 8) * TILE, y = (o.ty + 9) * TILE;
    const plain = spawn(sim, x, y);
    sim.command('a', { t: 'use', id: beacon.id });
    assert.equal(sim.s.dusk, 1, 'lit');
    const dark = spawn(sim, x + 20, y);
    assert.equal((dark.lv ?? 0) - (plain.lv ?? 0), TUNING.duskLevels);
    assert.ok(dark.mhp >= plain.mhp, 'and not weaker');
    sim.command('a', { t: 'use', id: beacon.id });
    assert.equal(sim.s.dusk, 0, 'put out');
    const calm = spawn(sim, x + 40, y);
    assert.equal(calm.lv, plain.lv);
});

test('the host tells every client whether the Long Dusk is on', async () => {
    const { SimHost } = await import('../src/shared/net/host');
    const { PROTOCOL } = await import('../src/shared/net/protocol');
    type Peer = import('../src/shared/net/host').Peer;
    type Tick = import('../src/shared/net/protocol').TickMsg;
    const msgs: { t: string; dusk?: number }[] = [];
    const peer = { send: (t: string) => { msgs.push(JSON.parse(t)); } } as Peer;
    const sim = Sim.create('DUSK-3', 'c');
    const host = new SimHost(sim, 'Test', '');
    host.attach(peer);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A' }));
    sim.s.dusk = 1;
    for (let i = 0; i < 80; i++) host.update(1 / 20);
    const ticks = msgs.filter((m): m is Tick & { dusk?: number } => m.t === 'tick');
    assert.ok(ticks.some((t) => t.dusk === 1), 'a tick carries the Dusk');
    sim.s.dusk = 0;
    msgs.length = 0;
    for (let i = 0; i < 80; i++) host.update(1 / 20);
    assert.ok(msgs.filter((m) => m.t === 'tick').some((t) => (t as { dusk?: number }).dusk === 0), 'and so does the end of it');
});
