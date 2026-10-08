// The Cloudflare host keeps worlds in its Durable Object's storage (server/cf/store.ts): gzipped, in chunks under the
// 2 MB value limit, two generations of the live save and a dozen named backups. This runs the store against a Map.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BACKUPS, CHUNK, gunzip, gzip, join, split, summary, WorldStore, type Kv } from '../server/cf/store';
import { Sim } from '../src/shared/sim/sim';

/** A Map that behaves like the storage API the store uses (values are copied, as structured clone would). */
function memKv () {
    const m = new Map<string, unknown>();
    const kv: Kv & { m: Map<string, unknown>; puts: number } = {
        m, puts: 0,
        async get<T> (key: string) { const v = m.get(key); return (v instanceof Uint8Array ? v.slice() : v === undefined ? undefined : structuredClone(v)) as T | undefined; },
        async put (entries) { kv.puts++; assert.ok(Object.keys(entries).length <= 128, 'one put carries at most 128 keys'); for (const [k, v] of Object.entries(entries)) { if (v instanceof Uint8Array) assert.ok(k.length + v.length <= 2 * 1024 * 1024, `${k} fits the 2 MB limit`); m.set(k, v instanceof Uint8Array ? v.slice() : structuredClone(v)); } },
        async delete (keys) { let n = 0; for (const k of keys) if (m.delete(k)) n++; return n; },
    };
    return kv;
}

/** Incompressible text of about `n` bytes (so the gzipped save really is that big). */
function noise (n: number) {
    let s = '', x = 12345;
    while (s.length < n) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += x.toString(36); }
    return s.slice(0, n);
}

test('gzip round trip, and splitting and joining bytes', async () => {
    const text = JSON.stringify({ hello: 'farm', list: Array.from({ length: 2000 }, (_, i) => i) });
    const z = await gzip(text);
    assert.ok(z.length < text.length / 2, 'it shrinks');
    assert.equal(await gunzip(z), text);
    const big = new Uint8Array(CHUNK * 2 + 17).map((_, i) => i % 251);
    const parts = split(big);
    assert.equal(parts.length, 3);
    assert.deepEqual(join(parts), big);
    assert.equal(split(new Uint8Array(0)).length, 1, 'an empty save is one empty chunk');
});

test('a real world saves and loads unchanged, and the summary says what it holds', async () => {
    const sim = Sim.create('CF-1', 'farm');
    sim.join('a', 'Ann');
    const kv = memKv(), store = new WorldStore(kv);
    assert.equal(await store.load(), null, 'nothing yet');
    const text = JSON.stringify(sim.s);
    const info = await store.save(text);
    assert.equal(await store.load(), text);
    assert.match(info.sum, /^day 1, 1 farmer: Ann \(level 1\); \d+ plots of land$/);
    assert.ok(info.bytes < text.length / 3, `stored gzipped (${info.bytes} of ${text.length} bytes)`);
    const back = new Sim(JSON.parse((await store.load())!));
    assert.equal(back.s.players.a.name, 'Ann', 'and the loaded save is a world the game can run');
});

test('a world bigger than one stored value is chunked, and every chunk fits the limit', async () => {
    const kv = memKv(), store = new WorldStore(kv);
    const text = JSON.stringify({ day: 3, players: {}, plots: [], blob: noise(3_000_000) });
    const info = await store.save(text);
    assert.ok(info.n >= 4, `${info.n} chunks`);
    assert.equal(await store.load(), text);
});

test('each save is one atomic put; the save before stays, the one before that is deleted', async () => {
    const kv = memKv(), store = new WorldStore(kv);
    for (let day = 1; day <= 4; day++) {
        const before = kv.puts;
        await store.save(JSON.stringify({ day, players: {}, plots: [] }));
        assert.equal(kv.puts - before, 1, 'one put per save');
    }
    const gens = [...kv.m.keys()].filter((k) => /^g\d+:/.test(k)).map((k) => k.split(':')[0]).sort();
    assert.deepEqual([...new Set(gens)], ['g3', 'g4'], 'the newest two generations only');
    assert.equal(JSON.parse((await store.load())!).day, 4);
});

test('a damaged newest save falls back to the one before it', async () => {
    const kv = memKv(), store = new WorldStore(kv);
    await store.save(JSON.stringify({ day: 7, players: {}, plots: [] }));
    await store.save(JSON.stringify({ day: 8, players: {}, plots: [] }));
    kv.m.delete('g2:0');
    assert.equal(JSON.parse((await store.load())!).day, 7);
});

test('named backups: listed newest first, readable, and only the newest dozen are kept', async () => {
    let t = 1_000;
    const kv = memKv(), store = new WorldStore(kv, () => (t += 1000));
    for (let i = 0; i < BACKUPS + 3; i++) await store.backup(JSON.stringify({ day: i, players: { a: { name: 'Bo', level: 2 } }, plots: [{ owned: true }] }), `test ${i}`);
    const list = await store.backups();
    assert.equal(list.length, BACKUPS);
    assert.equal(list[0].why, `test ${BACKUPS + 2}`, 'newest first');
    assert.equal(list[0].sum, `day ${BACKUPS + 2}, 1 farmer: Bo (level 2); 1 plots of land`);
    assert.equal(JSON.parse(await store.readBackup(list[3].id)).day, BACKUPS - 1);
    const kept = new Set(list.map((b) => `b${b.id}`));
    assert.ok([...kv.m.keys()].filter((k) => k.startsWith('b') && k !== 'bk').every((k) => kept.has(k.split(':')[0])), 'the dropped backups left no chunks behind');
    await assert.rejects(store.readBackup('nope'), /No such backup/);
});

test('the summary copes with anything', () => {
    assert.equal(summary('not json'), 'unreadable');
    assert.equal(summary('{}'), 'day ?, 0 farmers; 0 plots of land');
});
