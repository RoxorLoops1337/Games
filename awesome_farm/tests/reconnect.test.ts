// The client's side of a dropped line: WsConnection tries again with a backoff, says so while it does, picks up the world
// from the second welcome, and gives up after the last try. The browser globals it touches are stubbed; the server is real.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { freePort } from './netlib';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms: number, what: string) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return; await sleep(25); }
    throw new Error(`timed out waiting for ${what}`);
};
function startServer (port: number, dir: string) {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/main.ts'], {
        env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORLD: 'recon' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout!.on('data', (d) => { out += d; });
    child.stderr!.on('data', (d) => { out += d; });
    return { child, log: () => out };
}

interface Conn { status: string; error: string; poll (): { t: string }[]; close (): void }

/** Just enough browser for connection.ts and profile.ts. */
function stubBrowser () {
    const g = globalThis as Record<string, unknown>;
    const store = new Map<string, string>();
    const listeners: Record<string, ((ev?: unknown) => void)[]> = {};
    g.WebSocket = WebSocket;
    g.location = { search: '', protocol: 'http:' };
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    g.document = {
        visibilityState: 'visible',
        addEventListener: (t: string, f: (ev?: unknown) => void) => { (listeners[t] ??= []).push(f); },
        removeEventListener: (t: string, f: (ev?: unknown) => void) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== f); },
    };
    return { listeners, store };
}

test('a dropped line is picked up again with a backoff, the HUD is told, and after the last try the connection closes', async () => {
    const { listeners } = stubBrowser();
    // (loaded by a variable path, so the server's typecheck, which has no DOM, does not read the client module)
    const modPath = '../src/client/net/connection';
    const { WsConnection, RECONNECT_WAITS } = await import(modPath) as { WsConnection: new (label: string, password: string) => Conn; RECONNECT_WAITS: number[] };
    RECONNECT_WAITS.splice(0, RECONNECT_WAITS.length, 1, 1, 2, 3, 3);                  // (the real waits are 1-2-4-8-8 s; shorter here, but with room for a server restart under a full test run)
    const dir = mkdtempSync(join(tmpdir(), 'af-recon-'));
    const port = await freePort();
    let server = startServer(port, dir);
    let conn: Conn | null = null;
    try {
        await until(() => server.log().includes('Play here'), 20000, 'the server to start');
        conn = new WsConnection(`127.0.0.1:${port}`, '');
        const got: string[] = [];
        const pump = () => { for (const m of conn!.poll()) got.push(m.t); };
        await until(() => { pump(); return got.includes('welcome'); }, 8000, 'the first welcome');
        assert.equal(conn.status, 'open');
        assert.equal(listeners.visibilitychange?.length, 1, 'it listens for the phone waking up');
        // the line dies (the server goes away without a word)
        server.child.kill();
        await until(() => { pump(); return conn!.status === 'connecting'; }, 5000, 'the drop to be noticed');
        assert.match(conn.error, /Reconnecting… \(try 1 of 5\)/);
        // the server is back: a later try gets in, and a fresh welcome re-syncs the world
        server = startServer(port, dir);
        await until(() => { pump(); return /try [2-5] of 5/.test(conn!.error) || conn!.status !== 'connecting'; }, 8000, 'a second try');
        assert.ok(conn.status === 'open' || /try [2-5] of 5/.test(conn.error), `still trying, and counting (${conn.status}: ${conn.error})`);
        await until(() => server.log().includes('Play here'), 20000, 'the server to come back');
        await until(() => { pump(); return conn!.status === 'open' && got.filter((t) => t === 'welcome').length === 2; }, 12000, 'the second welcome');
        assert.equal(conn.error, '', 'nothing to say any more');
        assert.match(server.log(), /joined/);
        // gone for good: after the last try it gives up with the plain message (the waits are read at each try: short ones here,
        // nothing comes back, so the five tries still happen, only sooner)
        RECONNECT_WAITS.splice(0, RECONNECT_WAITS.length, 0.1, 0.1, 0.2, 0.3, 0.3);
        server.child.kill();
        await until(() => { pump(); return conn!.status === 'closed'; }, 20000, 'the last try to fail');
        assert.match(conn.error, /Lost connection/);
        assert.equal(listeners.visibilitychange?.length, 0, 'and stops listening');
        // waking up while a try is pending tries at once
        server = startServer(port, dir);
        await until(() => server.log().includes('Play here'), 20000, 'the server for the wake-up case');
        const conn2 = new WsConnection(`127.0.0.1:${port}`, '');
        await until(() => conn2.poll().some((m) => m.t === 'welcome'), 8000, 'the wake-up case to get in');
        server.child.kill();
        await until(() => { conn2.poll(); return conn2.status === 'connecting'; }, 5000, 'the drop');
        server = startServer(port, dir);
        await until(() => server.log().includes('Play here'), 20000, 'the server again');
        RECONNECT_WAITS.fill(30);                                                       // (no scheduled try would land in time)
        for (const f of listeners.visibilitychange ?? []) f();                           // the phone wakes up
        await until(() => conn2.poll().some((m) => m.t === 'welcome'), 8000, 'the wake-up try to get in');
        assert.equal(conn2.status, 'open');
        conn2.close();
    } finally {
        conn?.close();
        server.child.kill();
        await sleep(200);
        rmSync(dir, { recursive: true, force: true });
    }
});
