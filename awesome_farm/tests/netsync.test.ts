// A client that only reads server messages must end up with the same world the server has,
// across every entity type and event (monsters, bosses, creatures, factory, quests…).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NET, TILE } from '../src/shared/config';
import { SimHost, type Peer } from '../src/shared/net/host';
import { applyPlayerDelta, PROTOCOL, type PlayerView, type ServerMsg } from '../src/shared/net/protocol';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, CritE, Ent, MobE } from '../src/shared/sim/types';

interface Mirror { ents: Record<number, Ent>; players: Record<string, PlayerView>; peer: Peer; events: number; kinds: Set<string> }

function connect (host: SimHost, id: string): Mirror {
    const m: Mirror = { ents: {}, players: {}, events: 0, kinds: new Set(), peer: { send: () => undefined } };
    m.peer = {
        send: (text: string) => {
            const msg: ServerMsg = JSON.parse(text);
            if (msg.t === 'welcome') { m.ents = JSON.parse(JSON.stringify(msg.state.ents)); for (const p of Object.values(msg.state.players)) m.players[p.id] = JSON.parse(JSON.stringify(p)); }
            if (msg.t === 'tick') {
                for (const e of msg.ents) m.ents[e.id] = e;
                for (const g of msg.gone) delete m.ents[g];
                m.events += msg.ev.length;
                for (const d of msg.players) m.players[d.id] = applyPlayerDelta(m.players[d.id], d);
                for (const ev of msg.ev) m.kinds.add(ev.e);
            }
        },
    };
    host.attach(m.peer);
    host.receive(m.peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: id.toUpperCase() }));
    return m;
}

test('two clients stay in sync with the server through a busy five minutes', () => {
    const sim = Sim.create('NS-1', 'ns');
    sim.cheats = true;
    const host = new SimHost(sim, 'T');
    const a = connect(host, 'a'), b = connect(host, 'b');
    const pa = sim.s.players.a, pb = sim.s.players.b;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(pa.slot));
    pa.x = (o.tx + 6) * TILE; pa.y = (o.ty + 9) * TILE; pa.hearts = 99;
    pb.x = pa.x + 30; pb.y = pa.y; pb.hearts = 99;
    // content: an altar fight, a den with workers, wild creatures, a drill line, a few mobs
    sim.command('a', { t: 'devdo', op: 'skills' });
    for (const item of ['sigil_slime', 'pod', 'plank', 'ironbar', 'gear', 'wire', 'circuit', 'stone', 'brick', 'treat', 'rope', 'wood'] as const) sim.command('a', { t: 'devdo', op: 'item', id: item, n: 60 });
    const altar = sim.add<BuildE>({ k: 'bld', kind: 'altar', tx: o.tx + 3, ty: o.ty + 2, rot: 0 });
    sim.command('a', { t: 'summon', id: altar.id, boss: 'slime' });
    const den = sim.add<BuildE>({ k: 'bld', kind: 'den', tx: o.tx + 8, ty: o.ty + 3, rot: 0, inv: {} });
    pa.pets = [{ id: 'p1', sp: 'gnaw', name: 'G', lv: 4, xp: 0, traits: [] }, { id: 'p2', sp: 'hopper', name: 'H', lv: 3, xp: 0, traits: [] }];
    sim.command('a', { t: 'pet', op: 'assign', pet: 'p1', den: den.id });
    sim.command('a', { t: 'pet', op: 'companion', pet: 'p2' });
    sim.add<MobE>({ k: 'mob', kind: 'skeleton', x: pb.x + 40, y: pb.y, hp: 4, mhp: 4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    sim.add<MobE>({ k: 'mob', kind: 'archer', x: pb.x - 60, y: pb.y, hp: 4, mhp: 4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    sim.add<CritE>({ k: 'crit', sp: 'fuzzle', x: pa.x - 40, y: pa.y + 20, vx: 0, vy: 0, t: 1, lv: 2, mode: 0, st: 0, a: 0, life: 999, hx: pa.x - 40, hy: pa.y + 20 });
    sim.command('a', { t: 'chat', text: 'hello' });
    sim.command('b', { t: 'emote', id: 2 });
    // five minutes of play
    for (let t = 0; t < 300; t += 0.1) {
        pa.hearts = pb.hearts = 99;
        host.update(0.1);
        if (Math.round(t * 10) % 40 === 0) { pb.x += 3; pa.x -= 3; }
    }
    host.update(0.2); host.update(0.2);
    // everything near each player is mirrored exactly
    for (const [m, p] of [[a, pa], [b, pb]] as const) {
        let checked = 0;
        for (const e of Object.values(sim.s.ents)) {
            const [x, y] = e.k === 'node' || e.k === 'bld' ? [(e.tx + 0.5) * TILE, (e.ty + 0.5) * TILE] : [e.x, e.y];
            if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) > NET.aoi - 8) continue;
            checked++;
            // a drop's age ticks on the server but is never sent (the client only needs it for the first moments)
            const strip = (x: Ent | undefined) => (x && x.k === 'drop' ? { ...x, age: 0 } : x);
            assert.deepEqual(strip(m.ents[e.id]), strip(JSON.parse(JSON.stringify(e))), `${p.id}: ${e.k} ${e.id} differs`);
        }
        assert.ok(checked > 10, `${p.id} checked ${checked}`);
        for (const id of Object.keys(m.ents)) assert.ok(sim.s.ents[Number(id)], `${p.id} still has the removed entity ${id}`);
        assert.ok(m.kinds.has('chat') || p.id === 'b', 'chat reached everyone');
    }
    // players: you hold your whole record, friends only their public one, all folded from deltas
    const PUBLIC = ['id', 'name', 'color', 'slot', 'online', 'x', 'y', 'fx', 'fy', 'moving', 'warp', 'hearts', 'downed', 'revive', 'level', 'equip'] as const;
    for (const [m, p] of [[a, pa], [b, pb]] as const) {
        const other = p === pa ? pb : pa;
        const { mh, ...mine } = m.players[p.id];
        assert.ok(mh > 0, 'max hearts arrive with your record');
        assert.deepEqual(mine, JSON.parse(JSON.stringify(p)), `${p.id}: your own record is mirrored exactly`);
        for (const k of PUBLIC) assert.deepEqual((m.players[other.id] as unknown as Record<string, unknown>)[k], JSON.parse(JSON.stringify(other[k] ?? null)) ?? undefined, `${p.id} sees ${other.id}'s ${k}`);
    }
    // a key that goes away is removed on the client, not left stale
    const stale = a.players.a as unknown as Record<string, unknown>;
    sim.s.players.a.comp = undefined;
    host.update(0.2);
    assert.ok(!('comp' in a.players.a) && stale !== a.players.a, 'a dropped key is removed');
    const kinds = new Set(Object.values(sim.s.ents).map((e) => e.k));
    for (const k of ['crit', 'bld', 'node']) assert.ok(kinds.has(k as Ent['k']), `the world had a ${k}`);
});

test('an expedition is mirrored to every member of the party: their record, the arena monsters, the results', () => {
    const sim = Sim.create('NS-rift', 'ns');
    sim.cheats = true;
    const host = new SimHost(sim, 'T');
    const a = connect(host, 'a'), b = connect(host, 'b');
    const pa = sim.s.players.a, pb = sim.s.players.b;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(pa.slot));
    pa.x = (o.tx + 6) * TILE; pa.y = (o.ty + 8) * TILE; pb.x = pa.x + 20; pb.y = pa.y;
    const dock = sim.add<BuildE>({ k: 'bld', kind: 'dock', tx: o.tx + 5, ty: o.ty + 5, rot: 0, by: 'a' });
    host.update(0.2);
    sim.command('a', { t: 'rift', op: 'launch', id: dock.id, tier: 0 });
    let sawWave = false, sawPick = false;
    for (let t = 0; t < 120 && !(pa.rift && pa.rift.ph === 3); t += 0.1) {
        pa.hearts = pb.hearts = 99;
        for (const e of Object.values(sim.s.ents)) if (e.k === 'mob' && e.rift !== undefined) sim.killMob(e as MobE, pa);
        for (const q of [pa, pb]) if (q.rift?.ph === 2 && q.rift.offer) sim.command(q.id, { t: 'rift', op: 'pick', i: 0 });
        host.update(0.1);
        if (pa.rift?.ph === 1) sawWave = true;
        if (pa.rift?.ph === 2) sawPick = true;
        // each client's copy of its own expedition record always matches the server's
        for (const [m, p] of [[a, pa], [b, pb]] as const) {
            if (!p.rift) continue;
            assert.deepEqual(m.players[p.id].rift, JSON.parse(JSON.stringify(p.rift)), `${p.id}: the run view is mirrored`);
        }
    }
    host.update(0.2); host.update(0.2);
    assert.ok(sawWave && sawPick, 'the run went through its waves and its boon choices');
    assert.deepEqual(a.players.a.boons, pa.boons);
    assert.deepEqual(b.players.b.boons, pb.boons);
    assert.ok(a.kinds.has('riftend') && b.kinds.has('riftend'), 'both farmers got the results');
    assert.ok(a.kinds.has('fx'));
    // the party's lines in the arena were streamed only while they were near: the arena empties again at the end
    for (let t = 0; t < 20; t += 0.1) host.update(0.1);
    assert.equal(a.players.a.rift, undefined);
    assert.ok(!Object.values(a.ents).some((e) => e.k === 'mob' && e.rift !== undefined), 'no arena monsters linger on the client');
});
