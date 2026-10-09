// Play online: the worlds one Cloudflare worker hosts, the addresses that name them, and how the worker and the title screen use them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WORLD, PUBLIC_SERVER, routeOf, splitAddress, WORLDS, worldAddress, worldInfo } from '../src/shared/data/servers';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('the list: three worlds, ids that are safe names, the first one is the world that was there before', () => {
    assert.equal(WORLDS.length, 3);
    assert.equal(new Set(WORLDS.map((w) => w.id)).size, 3, 'unique ids');
    assert.equal(WORLDS[0].id, 'farm', 'the original world keeps its id: it is the name of its Durable Object and of its save');
    assert.equal(DEFAULT_WORLD, 'farm');
    for (const w of WORLDS) {
        assert.match(w.id, /^[a-z0-9_-]{1,24}$/);
        assert.ok(w.name.length >= 3 && w.name.length <= 12, `${w.name} fits a button`);
        assert.ok(w.blurb.length > 5 && !/—/.test(w.name + w.blurb), 'a line, with no em dash');
        assert.equal(worldInfo(w.id), w);
    }
    assert.equal(worldInfo('nope'), undefined);
    assert.equal(worldInfo('__proto__'), undefined);
    assert.equal(typeof PUBLIC_SERVER, 'string');
});

test('routes: /w/<world>/<what> goes to that world, anything else is not ours', () => {
    assert.deepEqual(routeOf('/w/quarry/status'), { world: 'quarry', rest: '/status' });
    assert.deepEqual(routeOf('/w/snowcap/ws'), { world: 'snowcap', rest: '/ws' });
    assert.deepEqual(routeOf('/w/farm/admin/state'), { world: 'farm', rest: '/admin/state' });
    assert.deepEqual(routeOf('/w/quarry'), { world: 'quarry', rest: '/' });
    for (const bad of ['/w/nope/status', '/w//status', '/w/', '/w', '/status', '/ws', '/admin', '/x/w/quarry/ws', '/w/QUARRY/ws', '/w/quarry%2Fx/ws', '/w/../admin', '/w/__proto__/ws', '/w/constructor/ws', '']) {
        assert.equal(routeOf(bad), null, bad);
    }
});

test('addresses: the host and the world, however the address was written; the first world keeps the plain address', () => {
    assert.deepEqual(splitAddress('https://x.workers.dev'), { base: 'https://x.workers.dev', world: null });
    assert.deepEqual(splitAddress('https://x.workers.dev/'), { base: 'https://x.workers.dev', world: null });
    assert.deepEqual(splitAddress('https://x.workers.dev/w/quarry'), { base: 'https://x.workers.dev', world: 'quarry' });
    assert.deepEqual(splitAddress('x.workers.dev/w/snowcap/ws'), { base: 'x.workers.dev', world: 'snowcap' });
    assert.deepEqual(splitAddress('https://x.workers.dev/w/quarry/status'), { base: 'https://x.workers.dev', world: 'quarry' });
    assert.deepEqual(splitAddress('localhost:7777'), { base: 'localhost:7777', world: null });
    assert.deepEqual(splitAddress('https://x.workers.dev/w/nope'), { base: 'https://x.workers.dev/w/nope', world: null }, 'a world we do not have is just part of the address');
    for (const hostile of ['', '   ', null, undefined, 5, {}, [], '/w/quarry', 'a'.repeat(5000), '\u0000\u0001']) {
        assert.doesNotThrow(() => splitAddress(hostile as never));
        assert.equal(typeof splitAddress(hostile as never).base, 'string');
    }
    assert.equal(worldAddress('https://x.workers.dev/', 'quarry'), 'https://x.workers.dev/w/quarry');
    // what the title screen builds goes back through the same rules
    for (const w of WORLDS) assert.equal(splitAddress(worldAddress('https://x.workers.dev', w.id)).world, w.id);
});

test('the worker: one deployment, a world per Durable Object, the old addresses still mean the first world', () => {
    const src = read('server/cf/worker.ts');
    assert.ok(/routeOf\(/.test(src) && /idFromName\(world\)/.test(src), 'a Durable Object per world, by its id');
    assert.ok(/pathname === '\/worlds'/.test(src), 'the list of worlds is a plain answer');
    const worlds = src.slice(src.indexOf("pathname === '/worlds'"), src.indexOf("pathname === '/worlds'") + 200);
    assert.ok(!/idFromName/.test(worlds), 'asking for the list wakes no world');
    assert.ok(/url\.pathname === '\/status' \|\| url\.pathname === '\/ws'[^\n]*toWorld\(env, defaultWorld\(env\)/.test(src), 'the old /status, /ws and /admin/* reach the first world');
    assert.ok(/ctx\.id\.name/.test(src), 'an object knows its own world');
    assert.ok(/world: this\.worldId/.test(src), 'its status says which world it is');
    const admin = read('server/cf/admin.html');
    assert.ok(/BASE \+ '\/admin\/'/.test(admin) && !/fetch\('\/admin\//.test(admin), 'the admin page works under the world it was opened for');
});

test('the title screen: a Play online button opens the three worlds as cards, the first world keeps the plain address', () => {
    const src = read('src/client/scenes/Title.ts');
    assert.ok(/'Play online  ▶'/.test(src) && /WORLDS\.forEach/.test(src), 'a button opens a card per world');
    assert.ok(/id === DEFAULT_WORLD \? this\.base : worldAddress\(this\.base, id\)/.test(src), 'the first world is the plain address (a farmer already there is still known)');
    assert.ok(/openCustom/.test(src) && /own server/.test(src), 'a PC\'s own address is still one tap away');
    assert.ok(!/Join a farm server/.test(src), 'no server box on the first look');
});
