// End to end: start the real dedicated server, play over a real WebSocket, restart the
// server and find the world as it was left. Slow-ish (spawns a process) but it is the only
// test that proves the wire format, saving and loading work together.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { UNDER_Y } from '../src/shared/config';
import { applyPlayerDelta, PROTOCOL, type PlayerView, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import type { Cmd, Ent, PlayerS } from '../src/shared/sim/types';
import { freePort } from './netlib';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 8000, what = 'condition') => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return; await sleep(25); }
    throw new Error(`timed out waiting for ${what}`);
};
function startServer (port: number, dir: string) {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/main.ts', '--cheats'], {
        env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORLD: 'e2e' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout!.on('data', (d) => { out += d; });
    child.stderr!.on('data', (d) => { out += d; });
    return { child, log: () => out };
}

class Client {
    ws!: WebSocket;
    me?: PlayerS;
    ents: Record<number, Ent> = {};
    ticks = 0;
    events: string[] = [];
    dug: number[] = [];
    welcome?: Extract<ServerMsg, { t: 'welcome' }>;
    refused = '';
    constructor (private port: number, public id: string, private name: string, private acct?: { name: string; key: string }) {}
    async connect () {
        this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
        this.ws.on('message', (data) => {
            const msg: ServerMsg = JSON.parse(data.toString());
            if (msg.t === 'welcome') { this.welcome = msg; this.id = msg.you; this.ents = { ...msg.state.ents }; this.me = msg.state.players[this.id]; }
            else if (msg.t === 'refused') this.refused = msg.reason;
            else if (msg.t === 'tick') {
                this.ticks++;
                const t = msg as TickMsg;
                for (const e of t.ents) this.ents[e.id] = e;
                for (const g of t.gone) delete this.ents[g];
                if (t.dug) this.dug.push(...t.dug);
                const mine = t.players.find((p) => p.id === this.id);
                if (mine) this.me = applyPlayerDelta(this.me as PlayerView | undefined, mine) as PlayerS;     // ticks carry only what changed
                for (const ev of t.ev) this.events.push(ev.e === 'banner' ? `banner:${ev.text}` : ev.e);
            }
        });
        await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
        this.ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, id: this.id, name: this.name, acct: this.acct }));
        await until(() => !!this.welcome || !!this.refused, 8000, 'welcome');
        assert.ok(!this.refused, this.refused);
    }
    send (c: Cmd) { this.ws.send(JSON.stringify({ t: 'cmd', c })); }
    close () { this.ws.close(); }
}

test('real server: join over a WebSocket, play, restart, come back to the same world', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'af-e2e-'));
    const port = await freePort();
    let server = startServer(port, dir);
    let child: ChildProcess = server.child;
    try {
        await until(() => server.log().includes('Play here'), 15000, 'the server to start');
        const status = await (await fetch(`http://127.0.0.1:${port}/status`)).json() as { game: string; protocol: number; online: number };
        assert.equal(status.game, 'awesome-farm');
        assert.equal(status.protocol, PROTOCOL);

        const a = new Client(port, 'alice', 'Alice');
        await a.connect();
        assert.ok(a.welcome!.state.plots.length > 0 && Object.keys(a.ents).length > 5, 'the welcome carries the world around you');
        await until(() => a.ticks > 3, 4000, 'ticks');
        const b = new Client(port, 'bob', 'Bob');
        await b.connect();
        await until(() => Object.keys(a.me ? { x: 1 } : {}).length > 0 && b.ticks > 2, 4000, 'bob ticks');
        assert.notEqual(a.me!.slot, b.me!.slot, 'different home islands');

        // cheats are on for this server: give materials, build a workbench next to alice, craft planks
        a.send({ t: 'devdo', op: 'item', id: 'wood', n: 40 });
        await until(() => (a.me?.inv?.wood ?? 0) >= 40, 4000, 'wood');
        const tx = Math.floor(a.me!.x / 16), ty = Math.floor(a.me!.y / 16);
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 1], [-3, 1], [1, 3]]) {
            if (Object.values(a.ents).some((e) => e.k === 'bld' && e.kind === 'workbench')) break;
            a.send({ t: 'build', kind: 'workbench', tx: tx + dx, ty: ty + dy, rot: 0 });
            await sleep(250);
        }
        await until(() => Object.values(a.ents).some((e) => e.k === 'bld' && e.kind === 'workbench'), 4000, 'a workbench');
        a.send({ t: 'craft', recipe: 'workbench:plank', n: 3 });
        await until(() => (a.me?.inv?.plank ?? 0) >= 3, 4000, 'planks');
        a.send({ t: 'chat', text: 'hello bob' });
        await until(() => b.events.includes('chat'), 4000, 'chat to arrive');
        const coins = a.me!.coins;
        // a named farmer on one device (signed up with a secret word) …
        const phone = new Client(port, 'carol-phone', 'Carol', { name: 'Carol', key: 'tulips' });
        await phone.connect();
        phone.send({ t: 'devdo', op: 'item', id: 'stone', n: 7 });
        await until(() => (phone.me?.inv?.stone ?? 0) >= 7, 4000, 'carol stone');
        // … and a thief who guesses wrong gets nowhere
        const thief = new Client(port, 'thief', 'Carol', { name: 'Carol', key: 'nottulips' });
        await assert.rejects(thief.connect(), /secret word/);
        thief.ws.close();
        a.close(); b.close(); phone.close();
        await sleep(600);                       // the server saves when the last farmer leaves

        // restart the server on the same data directory
        child.kill(); await sleep(400);
        assert.ok(readdirSync(dir).some((f) => f === 'e2e.json'), 'a save file exists');
        server = startServer(port, dir);
        child = server.child;
        await until(() => server.log().includes('Play here'), 15000, 'the server to restart');
        assert.ok(server.log().includes('Loaded world "e2e"'), 'it loaded the save');
        const a2 = new Client(port, 'alice', 'Alice');
        await a2.connect();
        assert.equal(a2.me!.inv.plank, 3, 'inventory kept');
        assert.equal(a2.me!.coins, coins);
        assert.ok(Object.values(a2.ents).some((e) => e.k === 'bld' && e.kind === 'workbench'), 'the workbench is still there');
        a2.close();
        // the secret word was saved with the world: another device signs in as the same farmer, stone and all
        const laptop = new Client(port, 'carol-laptop', 'Carol', { name: 'Carol', key: 'tulips' });
        await laptop.connect();
        assert.equal(laptop.id, 'carol-phone', 'the server says which farmer this is');
        assert.equal(laptop.welcome!.state.players['carol-phone'].inv.stone, 7, 'and it is the same farmer');
        assert.equal(laptop.welcome!.state.players['carol-laptop'], undefined, 'no second farmer was made');
        assert.equal((laptop.welcome!.state.players.alice as Partial<PlayerS>).inv, undefined, "other farmers' pockets are not in the welcome");
        assert.ok(laptop.welcome!.state.players.alice.name === 'Alice' && (laptop.welcome!.state.players.alice as { mh?: number }).mh! > 0, 'only what everyone may see');
        assert.ok(!JSON.stringify(laptop.welcome).includes('"accounts"'), 'the account table never reaches a client');
        laptop.close();

        // down a shaft over the wire, and still down there after a restart
        const cave = new Client(port, 'alice', 'Alice');
        await cave.connect();
        cave.send({ t: 'devdo', op: 'skills' });
        for (const [id, n] of [['plank', 40], ['stone', 60], ['ironbar', 20], ['rope', 10]] as const) cave.send({ t: 'devdo', op: 'item', id, n });
        await until(() => (cave.me?.inv?.rope ?? 0) >= 10 && (cave.me?.inv?.ironbar ?? 0) >= 20, 4000, 'materials');
        const ctx = Math.floor(cave.me!.x / 16), cty = Math.floor(cave.me!.y / 16);
        for (const [dx, dy] of [[2, -1], [2, 0], [-3, -1], [-3, 0], [1, 1], [-2, 1], [0, -3], [0, 2]]) {       // (close: you have to be able to reach it afterwards)
            if (Object.values(cave.ents).some((e) => e.k === 'bld' && e.kind === 'mineshaft')) break;
            cave.send({ t: 'build', kind: 'mineshaft', tx: ctx + dx, ty: cty + dy, rot: 0 });
            await sleep(250);
        }
        const shaft = Object.values(cave.ents).find((e) => e.k === 'bld' && e.kind === 'mineshaft');
        assert.ok(shaft, 'a mine shaft was built');
        cave.send({ t: 'use', id: shaft!.id });
        await until(() => (cave.me?.y ?? 0) > UNDER_Y * 16, 4000, 'to climb down');
        await until(() => Object.values(cave.ents).some((e) => e.k === 'bld' && e.kind === 'mineladder'), 4000, 'the ladder to arrive');
        assert.ok(cave.dug.length > 0 || cave.welcome!.state.mine === undefined, 'the dug landing was told');
        cave.close(); await sleep(600);
        child.kill(); await sleep(400);
        server = startServer(port, dir);
        child = server.child;
        await until(() => server.log().includes('Play here'), 15000, 'the server to restart again');
        const back = new Client(port, 'alice', 'Alice');
        await back.connect();
        assert.ok(back.welcome!.state.mine && back.welcome!.state.mine.stocked, 'the caves are in the save');
        assert.ok(back.me!.y > UNDER_Y * 16, 'and Alice is still down there');
        await until(() => Object.values(back.ents).some((e) => e.k === 'bld' && e.kind === 'mineladder'), 4000, 'the ladder to be there still');
        back.close();
    } finally {
        child.kill();
        await sleep(200);
        rmSync(dir, { recursive: true, force: true });
    }
});
