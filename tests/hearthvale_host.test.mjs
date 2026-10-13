// The platform-neutral Host (used by the Node server and the Cloudflare Durable Object) with fake peers,
// plus a stand-in for the Durable Object's chunked save and wake-up catch-up.
import assert from 'node:assert/strict';
import { Host } from '../hearthvale/shared/host.js';
import * as S from '../hearthvale/shared/sim.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
let clock = 1_000_000; const now = () => clock;
const host = new Host({ now, seed: 3 });
const peer = () => { const p = { out: [], closed: null, send(s) { p.out.push(JSON.parse(s)); }, close(c) { p.closed = c; }, backlog: 0 }; return p; };
const join = async (tok) => { const p = peer(), c = host.attach(p); await c.message(JSON.stringify({ t: 'join', token: tok, name: tok })); return { p, c }; };
const a = await join('token-aaaaaaaa'); ok(a.p.out[0].t === 'welcome', 'welcome');
const dup = await join('token-aaaaaaaa'); ok(a.p.closed === 4000, 'a second tab with the same token takes over'); ok(dup.p.out[0].id === a.p.out[0].id, 'same village for the same token');
ok((await join('x')).p.out[0].t === 'error', 'short token refused');
for (let i = 0; i < 15; i++) await join('token-player-' + i);
ok((await join('token-late-one')).p.out[0].t === 'full', 'valley full at 16');
const snapsBefore = dup.p.out.length; for (let i = 0; i < 4; i++) { clock += 100; host.step(); } ok(dup.p.out.length > snapsBefore, 'snapshots are sent while stepping');
dup.p.backlog = 1e6; const before = dup.p.out.length; for (let i = 0; i < 4; i++) { clock += 100; host.step(); } ok(dup.p.out.length === before, 'a backed-up client is skipped, not queued');
dup.c.close(); ok(host.online === 15, 'disconnect drops the connection');
// catch-up and chunked save round trip like the Durable Object does
const str = host.serialize(); const CH = 100 * 1024; const parts = []; for (let i = 0; i < Math.ceil(str.length / CH); i++) parts.push(str.slice(i * CH, (i + 1) * CH));
clock += 600_000; const host2 = new Host({ world: S.deserialize(parts.join('')), now }); ok(host2.W.t > host.W.t + 500, 'a restored valley catches up the time it slept');
ok(Object.keys(host2.W.players).length === 16, 'all villages survive save and restore');
console.log('hearthvale host: ' + n + ' checks passed'); process.exit(0);
