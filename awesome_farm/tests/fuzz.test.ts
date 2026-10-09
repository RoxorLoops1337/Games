// Hostile input: a server must survive whatever a client sends. Thousands of random commands
// (right types, wrong values; wrong types; missing fields; huge and non-finite numbers) are
// thrown at a busy world, and nothing may throw or leave the state unserialisable.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TILE } from '../src/shared/config';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL } from '../src/shared/net/protocol';
import { ITEM_ORDER } from '../src/shared/data/items';
import { BUILDINGS } from '../src/shared/data/buildings';
import { Rng } from '../src/shared/rng';
import * as quests from '../src/shared/sim/quests';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, Cmd, CritE, MobE, NodeE } from '../src/shared/sim/types';

const STEP = 1 / 20;

const CMD_TYPES = ['move', 'swing', 'use', 'buy', 'build', 'bp', 'demolish', 'eat', 'sell', 'craft', 'equip', 'unequip', 'skill', 'xfer', 'load', 'config', 'collect', 'revive', 'dash',
    'summon', 'tame', 'quest', 'chat', 'emote', 'ping', 'travel', 'shop', 'pet', 'pause', 'rift', 'fish', 'breed', 'crate', 'fortune', 'towerpick'] as const;
const OPS = ['claim', 'goal', 'bounty', 'reroll', 'companion', 'rest', 'assign', 'unassign', 'feed', 'release', 'rename', 'awaken', 'launch', 'pick', 'leave', 'cast', 'reel', 'cancel', 'start', 'hatch', 'put', 'take', 'spin', 'double'];

function world (seed: string) {
    const sim = Sim.create(seed, 'fuzz');
    sim.cheats = false;                                  // the real thing: no developer ops
    const a = sim.join('a', 'A')!, b = sim.join('b', 'B')!;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 6) * TILE; b.x = a.x + 20; b.y = a.y;
    sim.cheats = true;
    sim.command('a', { t: 'devdo', op: 'skills' }); sim.command('b', { t: 'devdo', op: 'skills' });
    for (const id of ['ironbar', 'plank', 'wood', 'stone', 'gear', 'wire', 'circuit', 'crystal', 'treat', 'pod', 'sigil_slime', 'seed_wheat', 'rod', 'bait', 'potion_heal', 'rift_shard'] as const) {
        sim.command('a', { t: 'devdo', op: 'item', id, n: 60 });
        sim.command('b', { t: 'devdo', op: 'item', id, n: 60 });
    }
    sim.cheats = false;
    for (let i = 0; i < 6; i++) sim.add<BuildE>({ k: 'bld', kind: (['chest', 'furnace', 'bed', 'altar', 'dock', 'hatchery'] as const)[i], tx: o.tx + 1 + i * 2, ty: o.ty + 1, rot: 0, by: 'a', inv: {}, out: {}, fin: {}, prog: 0, crop: -1 });
    sim.add<BuildE>({ k: 'bld', kind: 'den', tx: o.tx + 2, ty: o.ty + 8, rot: 0, by: 'a', inv: {} });
    sim.add<BuildE>({ k: 'bld', kind: 'fortune', tx: o.tx + 8, ty: o.ty + 4, rot: 0, by: 'a' });
    for (const id of ['crate_wood', 'crate_silver', 'crate_gold', 'bottle'] as const) { a.inv[id] = 40; b.inv[id] = 40; }
    a.coins = 5000; b.coins = 5000;
    sim.add<NodeE>({ k: 'node', kind: 'tree', tx: o.tx + 9, ty: o.ty + 9, hp: 3, plot: sim.homePlot(a.slot).i });
    sim.add<MobE>({ k: 'mob', kind: 'skeleton', x: a.x + 60, y: a.y, hp: 4, mhp: 4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    sim.add<CritE>({ k: 'crit', sp: 'fuzzle', x: a.x - 30, y: a.y, vx: 0, vy: 0, t: 1, lv: 2, mode: 0, st: 0, a: 0, life: 999, hx: a.x, hy: a.y });
    a.pets = [{ id: 'p1', sp: 'gnaw', name: 'G', lv: 3, xp: 0, traits: [] }, { id: 'p2', sp: 'hopper', name: 'H', lv: 3, xp: 0, traits: [] }];
    a.boss = { slime: 1 };
    return { sim, ids: Object.keys(sim.s.ents).map(Number) };
}

function junk (rng: Rng, ids: number[]): unknown {
    const pick = <T>(l: readonly T[]) => l[Math.floor(rng.next() * l.length)];
    const num = () => pick([0, 1, -1, 2, 3, 7, 100, 1e9, -1e9, NaN, Infinity, -Infinity, 0.5, 1e-9, Number.MAX_SAFE_INTEGER, rng.int(-50, 4000)]);
    const str = () => pick(['', 'x', 'wood', 'workbench:plank', 'sword_iron', '__proto__', 'constructor', 'a'.repeat(5000), 'rift', '<b>x</b>', 'p1', 'p2', 'seed_wheat', ...ITEM_ORDER.slice(0, 5)]);
    const val = (): unknown => pick([num, str, () => null, () => undefined, () => ({}), () => [], () => true, () => ({ x: 1 }), () => [1, 2, 3], () => pick(ids)])();
    const t = pick(CMD_TYPES);
    const c: Record<string, unknown> = { t };
    const fields = ['id', 'x', 'y', 'tx', 'ty', 'n', 'item', 'kind', 'recipe', 'op', 'pet', 'den', 'a', 'b', 'tier', 'i', 'seed', 'sel', 'flt', 'rot', 'boss', 'pod', 'text', 'plot', 'to', 'who', 'fx', 'fy', 'moving', 'on', 'items', 'slot', 'name', 'dir', 'part', 'omens', 'daily'];
    for (const f of fields) if (rng.chance(0.55)) c[f] = rng.chance(0.4) ? val() : f === 'id' || f === 'den' || f === 'who' ? (rng.chance(0.7) ? pick(ids) : val()) : f === 'op' ? pick(OPS) : f === 'kind' ? pick([...Object.keys(BUILDINGS), 'zzz']) : f === 'item' ? pick([...ITEM_ORDER, 'zzz']) : val();
    if (t === 'bp') c.items = rng.chance(0.7) ? Array.from({ length: rng.int(0, 8) }, () => ({ kind: pick([...Object.keys(BUILDINGS), 'zzz']), dx: num(), dy: num(), rot: num(), flt: val(), sel: val() })) : val();
    return rng.chance(0.03) ? val() : c;
}

test('thousands of hostile commands never crash the world', () => {
    for (const seed of ['FZ-1', 'FZ-2', 'FZ-3']) {
        const { sim, ids } = world(seed);
        const rng = new Rng('fuzz-' + seed);
        let count = 0;
        for (let i = 0; i < 6000; i++) {
            const c = junk(rng, ids);
            try { sim.command(rng.chance(0.5) ? 'a' : 'b', c as Cmd); } catch (e) { assert.fail(`${JSON.stringify(c)?.slice(0, 300)} threw ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`); }
            count++;
            if (i % 5 === 0) { try { sim.step(STEP); } catch (e) { assert.fail(`step after ${JSON.stringify(c)?.slice(0, 300)} threw ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}`); } }
            if (i % 997 === 0) { sim.s.players.a.hearts = 99; sim.s.players.b.hearts = 99; }
        }
        for (let t = 0; t < 30; t += STEP) sim.step(STEP);
        assert.ok(count === 6000);
        // the state is still plain JSON that loads back
        const copy = new Sim(JSON.parse(JSON.stringify(sim.s)));
        for (let t = 0; t < 5; t += STEP) copy.step(STEP);
        for (const p of Object.values(sim.s.players)) {
            for (const k of ['x', 'y', 'hearts', 'energy', 'coins', 'xp'] as const) assert.ok(Number.isFinite(p[k]), `${p.id}.${k} = ${p[k]}`);
            for (const [item, n] of Object.entries(p.inv)) assert.ok(Number.isFinite(n) && n >= 0, `${item}: ${n}`);
        }
    }
});

test('hostile messages over the wire never crash the host, and a bad hello is refused', () => {
    const sim = Sim.create('FZ-wire', 'fuzz');
    const host = new SimHost(sim, 'T');
    const got: string[] = [];
    const peer: Peer = { send: (t: string) => { got.push(t); }, close: () => undefined };
    host.attach(peer);
    const rng = new Rng('wire');
    const garbage = ['', '{', 'null', '[]', '{"t":1}', '{"t":"cmd"}', '{"t":"cmd","c":null}', '{"t":"cmd","c":5}', '{"t":"hello"}', '{"t":"hello","v":"x"}', '"hello"', 'undefined', '{"t":"cmd","c":{"t":"move"}}',
        '{"t":"cmd","c":{"t":"build","kind":"__proto__"}}', '{"t":"cmd","c":{"t":"craft","recipe":{"a":1},"n":"x"}}', '{"t":"ping"}', '{"t":"hello","v":' + PROTOCOL + ',"id":"","name":""}',
        '{"t":"hello","v":' + PROTOCOL + ',"id":{"toString":1},"name":{"toString":1}}', '{"t":"hello","v":' + PROTOCOL + ',"id":"g","name":"G","acct":{"name":{"toString":1},"key":{"toString":1}}}',
        '{"t":"hello","v":' + PROTOCOL + ',"id":"g","name":"G","acct":"__proto__"}', '{"t":"hello","v":' + PROTOCOL + ',"id":"g","name":"G","acct":{"name":"__proto__","key":"abcdef"}}', '{"t":"hello","v":' + PROTOCOL + ',"id":"' + 'z'.repeat(500) + '","name":"' + 'n'.repeat(500) + '"}'];
    for (let i = 0; i < 4000; i++) host.receive(peer, rng.chance(0.5) ? garbage[Math.floor(rng.next() * garbage.length)] : JSON.stringify(junk(rng, [1, 2, 3])));
    // a well-behaved client on its own connection still gets in (the garbage peer may have joined under a mangled id)
    const peer2: Peer = { send: (t: string) => { got.push(t); }, close: () => undefined };
    host.attach(peer2);
    host.receive(peer2, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'good', name: 'Good' }));
    for (let i = 0; i < 2000; i++) host.receive(peer2, JSON.stringify({ t: 'cmd', c: junk(rng, [1, 2, 3]) }));
    for (let t = 0; t < 5; t += 0.1) host.update(0.1);
    assert.ok(got.some((m) => m.includes('"welcome"')), 'a proper hello still gets a welcome');
    assert.ok(sim.s.players.good, 'and a player exists');
    assert.ok(Object.keys(sim.s.players).length <= 8);
});

test('a NaN or a property name where a number belongs leaves coins, pockets, counters and facing alone', () => {
    const sim = Sim.create('FZ-nan', 'fuzz');
    const a = sim.join('a', 'A')!;
    sim.cheats = true;
    sim.command('a', { t: 'devdo', op: 'skills' });
    sim.cheats = false;
    const o = sim.world.plotOrigin(sim.homePlot(a.slot));
    a.x = (o.tx + 6) * TILE; a.y = (o.ty + 6) * TILE;
    sim.add<BuildE>({ k: 'bld', kind: 'market', tx: o.tx + 7, ty: o.ty + 5, rot: 0, by: 'a' });
    a.inv.wood = 10; a.coins = 50;
    // selling: `Math.min(Math.floor(NaN), count)` is NaN, and `NaN <= 0` is false, so the whole stack used to go for NaN coins
    for (const n of [NaN, 'length', undefined, -3, 0.5, {}] as unknown as number[]) sim.command('a', { t: 'sell', item: 'wood', n });
    assert.equal(a.inv.wood, 10, 'nothing sold');
    assert.equal(a.coins, 50, 'coins untouched');
    assert.equal(a.cnt?.sell, undefined, 'nothing counted');
    sim.command('a', { t: 'sell', item: 'wood', n: Infinity });
    assert.equal(a.inv.wood, undefined, 'Infinity means all of them');
    assert.ok(Number.isFinite(a.coins) && a.coins > 50);
    // the trader: `stock['length']` is a number, which has no price
    const coins = a.coins;
    for (const i of ['length', -1, NaN, 1.5, 99] as unknown as number[]) sim.command('a', { t: 'shop', i, n: 1 });
    assert.equal(a.coins, coins, 'nothing bought');
    assert.ok(sim.s.shop!.stock.every((row) => Number.isFinite(row.n)));
    // moving: the facing is sent to everyone, so it has to be a number too
    sim.command('a', { t: 'move', x: a.x + 1, y: a.y, fx: NaN, fy: 0, moving: true });
    sim.command('a', { t: 'move', x: a.x + 1, y: a.y, fx: 1, fy: 'up' as unknown as number, moving: true });
    assert.ok(Number.isFinite(a.fx) && Number.isFinite(a.fy), `facing ${a.fx}, ${a.fy}`);
    // counters never take a NaN
    quests.count(a, 'nan', NaN);
    quests.count(a, 'nan', -1);
    assert.equal(a.cnt?.nan, undefined);
    quests.count(a, 'nan', 2);
    assert.equal(a.cnt?.nan, 2);
    // land: `plots['length']` is a number too
    sim.command('a', { t: 'buy', plot: 'length' as unknown as number });
    assert.ok(Number.isFinite(a.coins) && a.plotsBought === 0);
});
