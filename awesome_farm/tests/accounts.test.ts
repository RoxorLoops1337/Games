// Name + secret word accounts: the same farmer on any device, the word stored only as a salted hash, and hostile sign-ins going nowhere.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg } from '../src/shared/net/protocol';
import { hashKey, sha256, sha256Bytes } from '../src/shared/net/sha256';
import { Sim } from '../src/shared/sim/sim';

type WelcomeMsg = Extract<ServerMsg, { t: 'welcome' }>;
const inbox = (): Peer & { msgs: ServerMsg[] } => {
    const msgs: ServerMsg[] = [];
    return { msgs, send: (t: string) => { msgs.push(JSON.parse(t)); } };
};
function signIn (host: SimHost, id: string, acct: unknown, name = 'x') {
    const peer = inbox();
    host.attach(peer);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name, acct }));
    const first = peer.msgs[0];
    return { peer, first, welcome: first?.t === 'welcome' ? first as WelcomeMsg : undefined, refused: first?.t === 'refused' ? (first as { reason: string }).reason : undefined };
}
const newHost = (seed = 'ACCT-1') => new SimHost(Sim.create(seed, 'test'), 'Test');

test('sha256 matches the real thing, including awkward lengths', () => {
    for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'a'.repeat(1000), 'héllo wörld ✓ 🌾']) {
        assert.equal(sha256(s), createHash('sha256').update(s).digest('hex'), `length ${s.length}`);
    }
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 255);
    assert.equal(Buffer.from(sha256Bytes(bytes)).toString('hex'), createHash('sha256').update(bytes).digest('hex'));
    assert.notEqual(hashKey('word', 'a'), hashKey('word', 'b'), 'the salt matters');
    assert.equal(hashKey('word', 'a'), hashKey('word', 'a'));
});

test('a name and secret word give the same farmer on another device', () => {
    const host = newHost();
    const one = signIn(host, 'phone-1', { name: 'Ann', key: 'sunflower' }, 'Ann');
    assert.equal(one.welcome?.you, 'phone-1', 'the first device keeps the farmer it already had');
    assert.equal(host.sim.s.players['phone-1']?.name, 'Ann');
    const two = signIn(host, 'laptop-9', { name: 'Ann', key: 'sunflower' }, 'Ann');
    assert.equal(two.welcome?.you, 'phone-1', 'a new device is told which farmer to be');
    assert.equal(Object.keys(host.sim.s.players).length, 1, 'no second farmer was made');
    assert.equal(signIn(host, 'laptop-9', { name: 'ANN', key: 'sunflower' }).welcome?.you, 'phone-1', 'the name is not case sensitive');
});

test('a wrong secret word is refused, and six wrong tries lock the name for a minute', () => {
    const host = newHost('ACCT-2');
    signIn(host, 'a', { name: 'Bo', key: 'rightword' });
    for (let i = 0; i < 5; i++) assert.match(signIn(host, 'thief', { name: 'Bo', key: 'wrong' + i }).refused ?? '', /secret word/);
    assert.match(signIn(host, 'thief', { name: 'Bo', key: 'wrong5' }).refused ?? '', /secret word/);
    assert.match(signIn(host, 'a', { name: 'Bo', key: 'rightword' }).refused ?? '', /Too many/, 'even the right word waits it out');
    assert.equal(Object.keys(host.sim.s.players).filter((id) => id === 'thief').length, 0, 'the thief never got a farmer');
});

test('a new name keeps the farmer that device already has; a device bound to another name gets a fresh one', () => {
    const host = newHost('ACCT-3');
    host.sim.join('old-farmer', 'Old');
    host.sim.s.players['old-farmer'].coins = 1234;
    assert.equal(signIn(host, 'old-farmer', { name: 'Cy', key: 'abcd' }).welcome?.you, 'old-farmer');
    assert.equal(host.sim.s.players['old-farmer'].coins, 1234, 'nothing was lost');
    const other = signIn(host, 'old-farmer', { name: 'Di', key: 'abcd' }).welcome?.you ?? '';
    assert.match(other, /^acct-[0-9a-f]{16}$/, 'the same device signing up under a second name gets its own farmer');
    assert.notEqual(other, 'old-farmer');
    assert.equal(signIn(host, 'anywhere', { name: 'Cy', key: 'abcd' }).welcome?.you, 'old-farmer');
    assert.equal(signIn(host, 'anywhere', { name: 'Di', key: 'abcd' }).welcome?.you, other);
});

test('a name that an existing farmer already plays under is kept for that farmer own device', () => {
    const host = newHost('ACCT-3b');
    host.sim.join('snake-phone', 'Snakey');
    host.sim.s.players['snake-phone'].coins = 99;
    assert.match(signIn(host, 'stranger', { name: 'snakey', key: 'grab-it' }).refused ?? '', /already plays here/, 'a stranger cannot take the name');
    assert.equal(host.sim.s.accounts?.snakey, undefined, 'and no account was made');
    assert.equal(signIn(host, 'snake-phone', { name: 'Snakey', key: 'mine-now' }).welcome?.you, 'snake-phone', 'the farmer own device can');
    assert.equal(host.sim.s.players['snake-phone'].coins, 99);
    assert.equal(signIn(host, 'later-device', { name: 'Snakey', key: 'mine-now' }).welcome?.you, 'snake-phone', 'and from then on any device with the word');
    // two old farmers who both went by the default name: the second one has to pick another
    host.sim.join('f1', 'Farmer'); host.sim.join('f2', 'Farmer');
    assert.equal(signIn(host, 'f1', { name: 'Farmer', key: 'wordone' }).welcome?.you, 'f1');
    assert.match(signIn(host, 'f2', { name: 'Farmer', key: 'wordtwo' }).refused ?? '', /secret word/);
    assert.equal(signIn(host, 'f2', { name: 'Farmer Two', key: 'wordtwo' }).welcome?.you, 'f2');
    assert.equal(host.sim.s.players.f2.name, 'Farmer Two');
});

test('hostile sign-ins are refused without throwing or touching anything', () => {
    const host = newHost('ACCT-4');
    const before = JSON.stringify(host.sim.s.accounts ?? {});
    const bad: unknown[] = [null, 5, 'str', [], {}, { name: 'Ed' }, { key: 'abcd' }, { name: 'Ed', key: 'abc' }, { name: 'Ed', key: 5 }, { name: 5, key: 'abcd' }, { name: '__proto__', key: 'abcd' },
        { name: 'constructor', key: 'abcd' }, { name: 'toString', key: 'abcd' }, { name: 'x', key: 'abcd' }, { name: '<script>', key: 'abcd' }, { name: ' ', key: 'abcd' }, { name: 'n'.repeat(5000), key: 'abcd' },
        { name: { toString: 'x' }, key: 'abcd' }, { name: ['a', 'b'], key: 'abcd' }];
    for (const a of bad) {
        let r: ReturnType<typeof signIn> | undefined;
        assert.doesNotThrow(() => { r = signIn(host, 'h', a); });
        assert.ok(r?.refused || r?.welcome, 'always an answer');
        if (r?.welcome) assert.ok(/^[\p{L}\p{N}]/u.test(host.sim.s.players[r.welcome.you]?.name ?? 'ok'), 'a name that got in is a clean one');
    }
    assert.equal(Object.prototype.hasOwnProperty.call(host.sim.s.accounts ?? {}, '__proto__'), false);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.ok(Object.keys(host.sim.s.accounts ?? {}).every((k) => k !== '__proto__' && k !== 'constructor' && k !== 'tostring'), 'no reserved names became accounts');
    void before;
});

test('accounts survive a save and a restart, and the hash never leaves the server', () => {
    const host = newHost('ACCT-5');
    const first = signIn(host, 'dev-1', { name: 'Flo', key: 'tulips' }, 'Flo');
    const text = JSON.stringify(first.welcome);
    assert.ok(!text.includes('accounts'), 'the welcome carries no account table');
    assert.ok(!text.includes(host.sim.s.accounts!.flo.h), 'nor any hash');
    assert.ok(!text.includes(host.sim.s.accounts!.flo.salt), 'nor any salt');
    host.update(0.15);
    for (const m of first.peer.msgs) assert.ok(!JSON.stringify(m).includes(host.sim.s.accounts!.flo.h), 'no tick carries it either');

    let saved = '';
    host.onSave = (t) => { saved = t; };
    host.save();
    const again = new SimHost(new Sim(JSON.parse(saved)), 'Test');
    assert.equal(signIn(again, 'brand-new-device', { name: 'Flo', key: 'tulips' }).welcome?.you, 'dev-1', 'after a restart the same word still opens it');
    assert.match(signIn(again, 'brand-new-device', { name: 'Flo', key: 'roses!' }).refused ?? '', /secret word/);
});

test('without an account, a hello behaves exactly as before (solo and old servers)', () => {
    const host = newHost('ACCT-6');
    const plain = inbox();
    host.attach(plain);
    host.receive(plain, JSON.stringify({ t: 'hello', v: PROTOCOL, id: 'plain', name: 'Plain' }));
    assert.equal(plain.msgs[0].t, 'welcome');
    assert.equal((plain.msgs[0] as WelcomeMsg).you, 'plain');
    assert.deepEqual(host.sim.s.accounts ?? {}, {}, 'no account was made');
});
