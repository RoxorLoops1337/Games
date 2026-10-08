// The real dedicated server under abuse and bad luck: a broken URL, a flood of messages, an oversized message, a save that
// will not load, a simulation that throws, and a phone whose line drops and comes back. Spawns the server, as server.e2e does.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { freePort } from './netlib';
import { PROTOCOL, type ServerMsg } from '../src/shared/net/protocol';
import { Sim } from '../src/shared/sim/sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000, what = 'condition') => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return; await sleep(25); }
    throw new Error(`timed out waiting for ${what}`);
};

function startServer (port: number, dir: string, env: Record<string, string> = {}) {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/main.ts', '--cheats'], {
        env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORLD: 'hard', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout!.on('data', (d) => { out += d; });
    child.stderr!.on('data', (d) => { out += d; });
    return { child, log: () => out, exited: () => child.exitCode !== null };
}
async function withServer (fn: (s: ReturnType<typeof startServer>, port: number, dir: string) => Promise<void>, prepare?: (dir: string) => void) {
    const dir = mkdtempSync(join(tmpdir(), 'af-hard-'));
    prepare?.(dir);
    const p = await freePort();
    const server = startServer(p, dir);
    const child: ChildProcess = server.child;
    try {
        await until(() => server.log().includes('Play here'), 20000, 'the server to start');
        await fn(server, p, dir);
    } finally {
        child.kill();
        await sleep(200);
        rmSync(dir, { recursive: true, force: true });
    }
}

/** A bare farmer over the wire: the welcome, every message, the close code. */
async function farmer (port: number, id: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const msgs: ServerMsg[] = [];
    let closed: { code: number; reason: string } | null = null;
    ws.on('message', (d) => { msgs.push(JSON.parse(d.toString())); });
    ws.on('close', (code, reason) => { closed = { code, reason: reason.toString() }; });
    ws.on('error', () => undefined);
    await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
    ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, id, name: id }));
    await until(() => msgs.some((m) => m.t === 'welcome' || m.t === 'refused'), 8000, 'a welcome');
    const welcome = msgs.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }> | undefined;
    return { ws, msgs, welcome, closed: () => closed, send: (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)) };
}

test('real server: a broken URL is a 400, not the end of the world; an unknown file is a 404', async () => {
    await withServer(async (server, port) => {
        const bad = await fetch(`http://127.0.0.1:${port}/%`);
        assert.equal(bad.status, 400);
        assert.equal((await fetch(`http://127.0.0.1:${port}/%E0%A4%A`)).status, 400);
        assert.equal((await fetch(`http://127.0.0.1:${port}/nothing-here.js`)).status, 404);
        assert.equal((await fetch(`http://127.0.0.1:${port}/../package.json`)).status, 404, 'nothing outside the public folder');
        const status = await (await fetch(`http://127.0.0.1:${port}/status`)).json() as { game: string };
        assert.equal(status.game, 'awesome-farm', 'still serving');
        assert.ok(!server.exited());
    });
});

test('real server: a flood of messages ends the connection, an oversized one is refused with 1009, and the others play on', async () => {
    await withServer(async (server, port) => {
        const calm = await farmer(port, 'calm');
        const flood = await farmer(port, 'flood');
        for (let i = 0; i < 1500; i++) flood.send({ t: 'cmd', c: { t: 'chat', text: 'x' } });
        await until(() => flood.closed() !== null, 8000, 'the flooder to be cut off');
        assert.equal(flood.closed()!.code, 1008);
        assert.match(flood.closed()!.reason, /Too many/);
        assert.ok(/floods/.test(server.log()));
        const big = await farmer(port, 'big');
        big.send(JSON.stringify({ t: 'cmd', c: { t: 'chat', text: 'y'.repeat(70 * 1024) } }));
        await until(() => big.closed() !== null, 8000, 'the big message to be refused');
        assert.equal(big.closed()!.code, 1009);
        assert.match(big.closed()!.reason, /too big/i);
        const chatted = calm.msgs.filter((m) => m.t === 'tick').flatMap((m) => m.ev).filter((e) => e.e === 'chat').length;
        assert.ok(chatted > 0 && chatted < 200, `the calm farmer got the burst and not the flood (${chatted})`);
        calm.send({ t: 'cmd', c: { t: 'chat', text: 'still here' } });
        await until(() => calm.msgs.some((m) => m.t === 'tick' && m.ev.some((e) => e.e === 'chat' && (e as { text: string }).text === 'still here')), 4000, 'the calm farmer still chatting');
        assert.ok(!server.exited());
        calm.ws.close();
    });
});

test('real server: a damaged save is set aside and the backup is loaded; a save always exists while saving', async () => {
    const good = Sim.create('hard-backup', 'hard');
    good.join('kept', 'Kept');
    good.s.players.kept.coins = 4321;
    await withServer(async (server, port, dir) => {
        assert.ok(/Loaded world "hard" from its backup/.test(server.log()), server.log());
        assert.ok(readdirSync(dir).some((f) => /^hard\.incompatible-\d+\.json$/.test(f)), 'the damaged file was kept aside');
        const f = await farmer(port, 'kept');
        assert.equal(f.welcome!.state.players.kept.coins, 4321, 'the backup world');
        f.ws.close();
        await until(() => { try { return JSON.parse(readFileSync(join(dir, 'hard.json'), 'utf8')).players.kept.coins === 4321; } catch { return false; } }, 5000, 'the save after the leave');
        const names = readdirSync(dir);
        assert.ok(names.includes('hard.json') && names.includes('hard.json.bak'), `main and backup (${names.join(', ')})`);
        assert.ok(!names.includes('hard.json.tmp'), 'no temp file left');
    }, (dir) => {
        writeFileSync(join(dir, 'hard.json'), '{"version": 1, "this is": "not a world');
        writeFileSync(join(dir, 'hard.json.bak'), JSON.stringify(good.s));
    });
});

test('real server: a simulation that throws goes to a crash file and never over the good save', async () => {
    const world = Sim.create('hard-crash', 'hard');
    const p = world.join('vic', 'Vic')!;
    world.s.players.vic.coins = 99;
    world.add({ k: 'mob', kind: 'no-such-monster', x: p.x + 20, y: p.y, hp: 4, mhp: 4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 } as never);
    const json = JSON.stringify(world.s);
    await withServer(async (server, port, dir) => {
        const f = await farmer(port, 'vic');
        await until(() => /simulation error/.test(server.log()), 8000, 'the tick to throw');
        await sleep(600);
        assert.ok(!server.exited(), 'the server is still up');
        const names = readdirSync(dir);
        assert.equal(names.filter((n) => /^hard\.crash-.*\.json$/.test(n)).length, 1, `one crash file (${names.join(', ')})`);
        assert.equal(readFileSync(join(dir, 'hard.json'), 'utf8'), json, 'the save on disk is untouched');
        f.ws.close();
        await sleep(600);
        assert.equal(readFileSync(join(dir, 'hard.json'), 'utf8'), json, 'the leave did not save over it either');
        assert.ok((await fetch(`http://127.0.0.1:${port}/status`)).ok, 'and the server answers');
    }, (dir) => writeFileSync(join(dir, 'hard.json'), json));
});

test('real server: a line that just dies keeps the farmer a while, and coming back resumes without a leave', async () => {
    await withServer(async (server, port) => {
        const phone = await farmer(port, 'phone');
        const other = await farmer(port, 'other');
        phone.ws.terminate();                                   // no close frame: a phone asleep, a tunnel gone
        await until(() => /lost its connection/.test(server.log()), 5000, 'the server to notice');
        await sleep(300);
        assert.ok(!/phone left/.test(server.log()), 'no leave');
        const status = await (await fetch(`http://127.0.0.1:${port}/status`)).json() as { online: number };
        assert.equal(status.online, 1, 'not counted as connected');
        const back = await farmer(port, 'phone');
        assert.ok(back.welcome, 'back in');
        assert.equal(back.welcome!.state.players.phone.online, true);
        await sleep(300);
        assert.ok(!/phone left/.test(server.log()), 'still no leave: it simply carried on');
        other.ws.close();
        await until(() => /other left/.test(server.log()), 4000, 'a proper close leaves at once');
        back.ws.close();
    });
});
