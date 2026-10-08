// The server admin's tools on SimHost (the Cloudflare host's /admin page uses them): the farmer list, sending somebody back
// to the title screen, a new secret word for a farmer who lost theirs, taking a word away, and a banner for everybody.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SimHost, type Peer } from '../src/shared/net/host';
import { PROTOCOL, type ServerMsg } from '../src/shared/net/protocol';
import { Sim } from '../src/shared/sim/sim';

type Inbox = Peer & { msgs: ServerMsg[]; closed: number };
function hello (host: SimHost, id: string, name: string, acct?: { name: string; key: string }) {
    const peer: Inbox = { msgs: [], closed: 0, send (t: string) { this.msgs.push(JSON.parse(t)); }, close () { this.closed++; } };
    host.attach(peer);
    host.receive(peer, JSON.stringify({ t: 'hello', v: PROTOCOL, id, name, ...(acct ? { acct } : {}) }));
    const m = peer.msgs[0];
    return { peer, you: m?.t === 'welcome' ? m.you : '', refused: m?.t === 'refused' ? m.reason : '' };
}
const newHost = (seed: string) => new SimHost(Sim.create(seed, 'admin'), 'Test');

test('the farmer list says who is connected and who signs in with a secret word', () => {
    const host = newHost('ADM-list');
    hello(host, 'ann-phone', 'Ann', { name: 'Ann', key: 'tulips' });
    const bo = hello(host, 'bo', 'Bo');
    host.detach(bo.peer);
    host.sim.s.players.ann_phone = undefined as never; delete host.sim.s.players.ann_phone;
    const list = host.adminPlayers();
    assert.deepEqual(list.map((p) => [p.name, p.online, p.words]), [['Ann', true, ['ann']], ['Bo', false, []]]);
});

test('a kick sends that farmer back to the title screen with the reason, and nobody else', () => {
    const host = newHost('ADM-kick');
    const ann = hello(host, 'ann', 'Ann'), bo = hello(host, 'bo', 'Bo');
    assert.equal(host.kick('ann', 'Time for bed!'), true);
    const last = ann.peer.msgs.at(-1)!;
    assert.ok(last.t === 'refused' && last.reason === 'Time for bed!', 'told why (the game shows it and does not reconnect)');
    assert.equal(ann.peer.closed, 1);
    assert.equal(bo.peer.closed, 0);
    assert.equal(host.kick('nobody'), false, 'a farmer who is not here cannot be kicked');
});

test('a new secret word brings a farmer back on any device; the old word stops working', () => {
    const host = newHost('ADM-word');
    hello(host, 'ann-phone', 'Ann', { name: 'Ann', key: 'tulips' });
    assert.deepEqual(host.setWord('ann-phone', 'daffodil'), { name: 'Ann' });
    assert.match(hello(host, 'new-laptop', 'Ann', { name: 'Ann', key: 'tulips' }).refused, /not its secret word/);
    assert.equal(hello(host, 'new-laptop', 'Ann', { name: 'Ann', key: 'daffodil' }).you, 'ann-phone', 'the new word, from a new device, is Ann');
    // a farmer who never had a word gets one under their own name
    hello(host, 'bo', 'Bo');
    assert.deepEqual(host.setWord('bo', 'pebbles'), { name: 'Bo' });
    assert.equal(hello(host, 'bo-tablet', 'Bo', { name: 'Bo', key: 'pebbles' }).you, 'bo');
    assert.match(String((host.setWord('bo', 'abc') as { error: string }).error), /4 characters/);
    assert.match(String((host.setWord('ghost', 'abcd') as { error: string }).error), /No such farmer/);
});

test('a word that is taken away lets the farmer back in from the device they played on', () => {
    const host = newHost('ADM-forget');
    const first = hello(host, 'cy-phone', 'Cy', { name: 'Cy', key: 'secret1' });
    host.detach(first.peer);
    assert.match(hello(host, 'cy-phone', 'Cy').refused, /secret word/, 'with a word, the device alone is not enough');
    assert.equal(host.forgetWord('cy-phone'), 1);
    assert.equal(hello(host, 'cy-phone', 'Cy').you, 'cy-phone', 'without it, the device gets in');
    assert.equal(host.forgetWord('cy-phone'), 0);
});

test('an announcement is a banner for everybody, cleaned and kept short', () => {
    const host = newHost('ADM-say');
    hello(host, 'ann', 'Ann'); hello(host, 'bo', 'Bo');
    host.sim.events.length = 0;
    assert.equal(host.announce('  Server restarts in 5 minutes\u0007  '), true);
    const ev = host.sim.events.find((e) => e.e === 'banner');
    assert.ok(ev && ev.e === 'banner' && ev.text === 'Server restarts in 5 minutes' && !ev.to, 'one banner, for everybody');
    assert.equal(host.announce('   '), false, 'nothing to say says nothing');
    host.announce('x'.repeat(500));
    const long = host.sim.events.filter((e) => e.e === 'banner').at(-1);
    assert.ok(long && long.e === 'banner' && long.text.length <= 90);
});
