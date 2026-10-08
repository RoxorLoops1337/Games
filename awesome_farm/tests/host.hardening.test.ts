// The host against a hostile or unlucky client: nobody takes a named farmer without the word, sign-ups cannot fill the world,
// command spam cannot flood everyone with ticks, names off the wire are clean, friends see only public records, a dropped
// line keeps the farmer a while, and the locks follow the player rather than the socket.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PLAYERS } from '../src/shared/config';
import { SimHost, type HostOptions, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg, type TickMsg } from '../src/shared/net/protocol';
import { hashKey } from '../src/shared/net/sha256';
import { Sim } from '../src/shared/sim/sim';
import type { MobE, PlayerS } from '../src/shared/sim/types';

type Inbox = Peer & { msgs: ServerMsg[] };
type Welcome = Extract<ServerMsg, { t: 'welcome' }>;
const inbox = (extra: Partial<Peer> = {}): Inbox => { const msgs: ServerMsg[] = []; return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); }, ...extra }; };
const ticks = (p: Inbox) => p.msgs.filter((m): m is TickMsg => m.t === 'tick');
const answer = (p: Inbox) => { const m = p.msgs[0]; return { welcome: m?.t === 'welcome' ? m as Welcome : undefined, refused: m?.t === 'refused' ? m.reason : '' }; };
function hello (host: SimHost, id: string, name: string, acct?: { name: string; key: string }, extra: Partial<Peer> = {}) {
    const peer = inbox(extra);
    host.attach(peer);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name, ...(acct ? { acct } : {}) }));
    return { peer, ...answer(peer) };
}
const cmd = (host: SimHost, peer: Peer, c: unknown) => host.receive(peer, JSON.stringify({ t: 'cmd', c }));
const newHost = (seed: string, opts: HostOptions = {}, password = '') => { const host = new SimHost(Sim.create(seed, 'hard'), 'Test', password, opts); const lines: string[] = []; host.onLog = (l) => lines.push(l); return { host, lines }; };

test('a farmer with a secret word is only ever theirs: a hello with just their id, or their name, is refused', () => {
    const { host } = newHost('HARD-takeover');
    assert.equal(hello(host, 'phone-1', 'Ann', { name: 'Ann', key: 'sunflower' }).welcome?.you, 'phone-1');
    // ids are in every welcome and tick, so knowing one must be worth nothing
    assert.match(hello(host, 'phone-1', 'Ann').refused, /secret word/, 'the id alone (even from the same device) does not get in');
    assert.match(hello(host, 'thief', 'Ann').refused, /secret word/, 'nor does the name');
    assert.match(hello(host, 'thief', 'ANN').refused, /secret word/, 'in any case');
    assert.equal(Object.keys(host.sim.s.players).length, 1, 'no farmer was made for the thief');
    assert.equal(hello(host, 'phone-1', 'Ann', { name: 'Ann', key: 'sunflower' }).welcome?.you, 'phone-1', 'the word still does');
    assert.equal(hello(host, 'bo', 'Bo').welcome?.you, 'bo', 'a plain farmer with another name is fine');
});

test('a sign-up the world has no room for writes no account row, and orphan rows are dropped when a world loads', () => {
    const { host } = newHost('HARD-full');
    for (let i = 0; i < MAX_PLAYERS; i++) host.sim.join(`f${i}`, `F${i}`);
    assert.match(hello(host, 'late', 'Late', { name: 'Late', key: 'abcd' }).refused, /farmers/);
    assert.equal(host.sim.s.accounts?.late, undefined, 'the refused sign-up left no row behind');
    assert.equal(hello(host, 'f3', 'F3', { name: 'Threepio', key: 'abcd' }).welcome?.you, 'f3', 'an existing farmer may still take a name');
    // a row whose farmer does not exist only holds a name hostage
    const state = JSON.parse(JSON.stringify(host.sim.s));
    state.accounts.ghost = { id: 'nobody', salt: 'ab', h: 'cd' };
    const again = new SimHost(new Sim(state), 'Test');
    assert.equal(again.sim.s.accounts?.ghost, undefined, 'dropped on load');
    assert.equal(again.sim.s.accounts?.threepio?.id, 'f3', 'real rows stay');
});

test('one device makes two new farmers at most, and one connection gets a few hellos', () => {
    const { host } = newHost('HARD-device');
    assert.equal(hello(host, 'dev-1', 'A', { name: 'Alpha', key: 'abcd' }).welcome?.you, 'dev-1', 'the first keeps the device farmer');
    assert.match(hello(host, 'dev-1', 'B', { name: 'Beta', key: 'abcd' }).welcome?.you ?? '', /^acct-/, 'the second is a new farmer');
    assert.match(hello(host, 'dev-1', 'C', { name: 'Gamma', key: 'abcd' }).refused, /enough/, 'the third is refused');
    assert.equal(host.sim.s.accounts?.gamma, undefined);
    assert.equal(Object.keys(host.sim.s.players).length, 2);
    // a connection that ignores being closed still runs out of hellos
    const peer = inbox({ close: () => undefined });
    host.attach(peer);
    for (let i = 0; i < 6; i++) host.receive(peer, JSON.stringify({ t: 'hello', v: 1, id: 'x', name: 'X' }));
    const reasons = peer.msgs.map((m) => (m.t === 'refused' ? m.reason : m.t));
    assert.equal(reasons.length, 6);
    assert.match(reasons[4], /version/);
    assert.match(reasons[5], /Too many tries/);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'x', name: 'X' }));
    assert.equal(peer.msgs[6].t, 'refused', 'even a good hello, now');
});

test('command spam is answered with a burst of broadcasts, then one per update, never a tick flood', () => {
    const { host } = newHost('HARD-flood');
    const a = hello(host, 'a', 'Ann').peer, b = hello(host, 'b', 'Bo').peer;
    b.msgs.length = 0;
    for (let i = 0; i < 500; i++) cmd(host, a, { t: 'chat', text: 'spam' });
    const burst = ticks(b).length;
    assert.ok(burst > 0 && burst <= 30, `a burst of at most thirty (${burst})`);
    assert.ok(host.pending, 'a broadcast is owed');
    host.update(0.05);
    assert.equal(ticks(b).length, burst + 1, 'the rest waited for the update: one broadcast');
    assert.equal(host.sim.events.length, 0, 'which carried everything still pending');
    for (let i = 0; i < 100; i++) cmd(host, a, { t: 'chat', text: 'more' });
    const n = ticks(b).length;
    assert.ok(n - burst - 1 <= 3, `nearly out of budget: ${n - burst - 1} more`);
    for (let i = 0; i < 20; i++) host.update(0.05);     // a second: the budget is back
    b.msgs.length = 0;
    for (let i = 0; i < 20; i++) cmd(host, a, { t: 'chat', text: 'later' });
    assert.equal(ticks(b).length, 20, 'twenty quick actions, twenty quick answers');
});

test('the secret-word hasher can be swapped (a server uses a native one), and sign-ins are rate limited for everybody', () => {
    const custom = (key: string, salt: string) => `fake:${key}:${salt}`;
    const { host } = newHost('HARD-hash', { hash: custom });
    assert.equal(hello(host, 'p1', 'Flo', { name: 'Flo', key: 'tulips' }).welcome?.you, 'p1');
    const row = host.sim.s.accounts!.flo;
    assert.equal(row.h, custom('tulips', row.salt), 'the row was made with the swapped hasher');
    assert.equal(hello(host, 'p2', 'Flo', { name: 'Flo', key: 'tulips' }).welcome?.you, 'p1', 'and checked with it');
    assert.match(hello(host, 'p2', 'Flo', { name: 'Flo', key: 'roses' }).refused, /secret word/);
    // the default is the pure one that made the rows already in every save
    const plain = newHost('HARD-hash2').host;
    hello(plain, 'p1', 'Flo', { name: 'Flo', key: 'tulips' });
    assert.equal(plain.sim.s.accounts!.flo.h, hashKey('tulips', plain.sim.s.accounts!.flo.salt));
    // every word costs a hash, so only so many a minute
    let t = 1_000_000;
    host.now = () => t;
    let busy = 0;
    for (let i = 0; i < 70; i++) if (/busy/.test(hello(host, `d${i}`, 'Flo', { name: 'Flo', key: 'tulips' }).refused)) busy++;
    assert.ok(busy >= 10 && busy <= 13, `after about sixty, the rest wait (${busy} told so)`);
    t += 61_000;
    assert.equal(hello(host, 'later', 'Flo', { name: 'Flo', key: 'tulips' }).welcome?.you, 'p1', 'a minute later it is fine');
});

test('names off the wire are made safe, and nobody plays under a named farmer name without the word', () => {
    const { host } = newHost('HARD-names');
    assert.equal(hello(host, 'a', '  Bo\u0007b  ').welcome && host.sim.s.players.a.name, 'Bob', 'control characters go');
    assert.equal(hello(host, 'b', '<script>alert(1)</script>').welcome && host.sim.s.players.b.name, 'Farmer 2', 'nothing usable: the default');
    assert.equal(hello(host, 'c', '').welcome && host.sim.s.players.c.name, 'Farmer 3');
    assert.equal(hello(host, 'd', '__proto__').welcome && host.sim.s.players.d.name, 'Farmer 4');
    assert.equal(hello(host, 'e', 'x'.repeat(100)).welcome && host.sim.s.players.e.name, 'x'.repeat(16), 'cut to sixteen');
    assert.equal(hello(host, 'f', 'Zoë-Lu 9').welcome && host.sim.s.players.f.name, 'Zoë-Lu 9', 'letters of any alphabet, digits and a few marks stay');
    hello(host, 'g', 'Gus', { name: 'Gus', key: 'abcd' });
    assert.match(hello(host, 'h', 'gus').refused, /secret word/, 'the name of a farmer with a word is theirs');
    assert.equal(hello(host, 'a', 'Bob').welcome?.you, 'a', 'a known farmer comes back under their name');
});

test('the welcome carries other farmers as their public record only; your own is whole; the first tick tidies up', () => {
    const { host } = newHost('HARD-welcome');
    hello(host, 'a', 'Ann');
    host.sim.s.players.a.inv.wood = 12; host.sim.s.players.a.coins = 77; host.sim.s.players.a.skills.swift = 2; host.sim.s.players.a.mail = [];
    const b = hello(host, 'b', 'Bo');
    const seen = b.welcome!.state.players.a as Partial<PlayerS> & { mh?: number };
    for (const k of ['inv', 'coins', 'mail', 'qs', 'xp', 'energy', 'pets'] as const) assert.equal(seen[k], undefined, `Ann's ${k} is not Bo's business`);
    for (const k of ['id', 'name', 'x', 'y', 'hearts', 'level', 'equip'] as const) assert.notEqual(seen[k], undefined, `but her ${k} is`);
    assert.ok(seen.mh! > 0, 'and her max hearts');
    assert.equal(seen.skills, undefined); assert.equal(seen.buffs, undefined);      // (her skills are hers; the client reads `mh` instead of working it out)
    const mine = b.welcome!.state.players.b;
    assert.ok(mine.inv && mine.skills && typeof mine.coins === 'number', 'your own record is whole');
    assert.ok(!JSON.stringify(b.welcome).includes('"accounts"'));
    host.update(0.15);
    const first = ticks(b.peer)[0].players.find((d) => d.id === 'a')!;
    assert.ok(first.name === 'Ann' && !('inv' in first) && !('skills' in first), 'the first tick tells everything public about her and nothing private');
    assert.ok(ticks(b.peer)[0].players.find((d) => d.id === 'b')!.inv, 'and everything about you');
});

test('a dropped line keeps the farmer for the grace period; back in time resumes, out of time leaves; a clean close leaves at once', () => {
    const { host, lines } = newHost('HARD-grace', { grace: 30 });
    let t = 5_000_000;
    host.now = () => t;
    const a = hello(host, 'a', 'Ann').peer;
    hello(host, 'b', 'Bo');
    host.detach(a, false);
    assert.equal(host.sim.s.players.a.online, true, 'still in the world');
    assert.equal(host.playerCount, 1, 'but not counted as connected');
    assert.ok(host.pending && host.waiting.includes('a'), 'the server keeps ticking for her');
    assert.ok(lines.some((l) => /lost its connection/.test(l)) && !lines.some((l) => /Ann left/.test(l)));
    t += 10_000; host.update(0.05);
    assert.equal(host.sim.s.players.a.online, true);
    const back = hello(host, 'a', 'Ann');
    assert.equal(back.welcome?.you, 'a');
    assert.ok(!host.waiting.includes('a') && !lines.some((l) => /Ann left/.test(l)), 'she simply carried on');
    assert.ok(lines.some((l) => /Ann is back/.test(l)) && lines.filter((l) => /Ann joined/.test(l)).length === 1, 'no second join: nobody is told she came back');
    assert.ok(!host.sim.events.some((e) => e.e === 'banner' && /Welcome back/.test((e as { text: string }).text)), 'and no welcome-back banner');
    host.detach(back.peer, false);
    t += 31_000; host.update(0.05);
    assert.equal(host.sim.s.players.a.online, false, 'out of time: she left');
    assert.ok(lines.some((l) => /Ann left/.test(l)));
    const c = hello(host, 'c', 'Cy').peer;
    host.detach(c);
    assert.equal(host.sim.s.players.c.online, false, 'a deliberate close leaves at once');
    // without a grace (solo, the tests) nothing waits
    const solo = newHost('HARD-grace0').host;
    const s = hello(solo, 's', 'S').peer;
    solo.detach(s, false);
    assert.equal(solo.sim.s.players.s.online, false);
});

test('a save after a leave waits for the next update instead of running inside the close', () => {
    const { host } = newHost('HARD-leavesave');
    let saves = 0;
    host.onSave = () => { saves++; };
    const a = hello(host, 'a', 'Ann').peer;
    host.detach(a);
    assert.equal(saves, 0, 'not yet');
    assert.ok(host.pending);
    host.update(0.05);
    assert.equal(saves, 1, 'on the next update');
    assert.ok(!host.pending);
});

test('the join password: right gets in, wrong and missing do not', () => {
    const { host } = newHost('HARD-pw', {}, 'hunter2');
    assert.match(answer(((): Inbox => { const p = inbox(); host.attach(p); host.receive(p, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A', password: 'hunter3' })); return p; })()).refused, /password/);
    assert.match(answer(((): Inbox => { const p = inbox(); host.attach(p); host.receive(p, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A' })); return p; })()).refused, /password/);
    assert.match(answer(((): Inbox => { const p = inbox(); host.attach(p); host.receive(p, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A', password: { toString: 1 } })); return p; })()).refused, /password/);
    const ok = inbox(); host.attach(ok);
    host.receive(ok, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'a', name: 'A', password: 'hunter2' }));
    assert.equal(ok.msgs[0].t, 'welcome');
});

test('the developer key lock follows the address (or the farmer), so a reconnect does not reset it', () => {
    const KEY = 'swordfish-4242';
    const { host } = newHost('HARD-devlock', { devKey: KEY });
    const a = hello(host, 'a', 'Ann', undefined, { addr: '10.0.0.7' }).peer;
    for (let i = 0; i < 3; i++) cmd(host, a, { t: 'dev', key: `wrong-${i}` });
    host.detach(a);
    // a fresh socket from the same address, as a different farmer, carries the count on
    const b = hello(host, 'b', 'Bo', undefined, { addr: '10.0.0.7' }).peer;
    cmd(host, b, { t: 'dev', key: 'wrong-3' });
    cmd(host, b, { t: 'dev', key: KEY });
    assert.ok(!host.sim.devs.has('b'), 'four wrong across two connections lock it');
    // without an address (solo, the tests) the farmer id is the key
    const c = hello(host, 'c', 'Cy').peer;
    for (let i = 0; i < 4; i++) cmd(host, c, { t: 'dev', key: `nope-${i}` });
    host.detach(c);
    const c2 = hello(host, 'c', 'Cy').peer;
    cmd(host, c2, { t: 'dev', key: KEY });
    assert.ok(!host.sim.devs.has('c'), 'still locked after reconnecting');
    const d = hello(host, 'd', 'Di', undefined, { addr: '10.0.0.8' }).peer;
    cmd(host, d, { t: 'dev', key: KEY });
    assert.ok(host.sim.devs.has('d'), 'another address is not locked');
});

test('a connection that cannot take more is told what it missed once it can', () => {
    const { host } = newHost('HARD-slow');
    let ready = true;
    const a = hello(host, 'a', 'Ann', undefined, { ready: () => ready }).peer;
    const b = hello(host, 'b', 'Bo').peer;
    const pa = host.sim.s.players.a, pb = host.sim.s.players.b;
    pb.x = pa.x + 30; pb.y = pa.y;                 // (next to Ann, so he sees what she sees)
    host.update(0.15);
    a.msgs.length = 0; b.msgs.length = 0;
    ready = false;
    const mob = host.sim.add<MobE>({ k: 'mob', kind: 'slime', x: pa.x + 40, y: pa.y, hp: 4, mhp: 4, vx: 0, vy: 0, t: 0, hopT: 0, knockT: 0 });
    pa.coins += 5;
    host.flush();
    assert.equal(ticks(a).length, 0, 'nothing is queued on a full connection');
    assert.ok(ticks(b).some((t) => t.ents.some((e) => e.id === mob.id)), 'the others carry on');
    const tree = Object.values(host.sim.s.ents).find((e) => e.k === 'node' && Math.abs(e.tx * 16 - pa.x) < 200 && Math.abs(e.ty * 16 - pa.y) < 200);
    if (tree) host.sim.remove(tree.id);
    host.flush();
    ready = true;
    host.flush();
    const got = ticks(a);
    assert.equal(got.length, 1);
    assert.ok(got[0].ents.some((e) => e.id === mob.id), 'the monster that arrived meanwhile');
    if (tree) assert.ok(got[0].gone.includes(tree.id), 'the tree that went meanwhile');
    assert.equal(got[0].players.find((d) => d.id === 'a')?.coins, pa.coins, 'and her own record, whole again');
});
