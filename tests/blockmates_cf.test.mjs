// Blockmates: the Cloudflare Durable Object, driven with a fake WebSocketPair and fake storage.
import assert from 'node:assert/strict';

class FakeSocket {
  constructor() { this.l = {}; this.sent = []; this.peer = null; }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  accept() {}
  send(d) { this.sent.push(JSON.parse(d)); }
  emit(t, ev) { for (const f of this.l[t] || []) f(ev); }
}
let lastPair = null;
globalThis.WebSocketPair = function () { lastPair = { 0: new FakeSocket(), 1: new FakeSocket() }; return lastPair; };
class FakeResponse { constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.webSocket = init.webSocket; this.headers = init.headers || {}; } static redirect(u, s) { const r = new FakeResponse(null, { status: s }); r.location = u; return r; } async json() { return JSON.parse(this.body); } }
globalThis.Response = FakeResponse;
const { WorldDO, default: worker } = await import('../blockmates/server/cf/worker.js');

function storage() {
  const m = new Map();
  return { m, get: async (k) => m.get(k), put: async (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) m.set(a, b); else m.set(k, v); }, list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix))) };
}
const mkState = (st) => ({ storage: st, blockConcurrencyWhile: (f) => { st.ready = f(); return st.ready; } });
const req = (path, upgrade) => ({ url: 'https://x.dev' + path, headers: { get: (h) => (h === 'Upgrade' && upgrade ? 'websocket' : null) }, method: 'GET' });

let passed = 0;
const ok = (n) => { passed++; console.log('ok  ' + n); };
const st = storage();
const env = { WORLD_NAME: 'Test', SEED: '9', OPS: 'Ann' };
const doo = new WorldDO(mkState(st), env);
await st.ready;

const status = await doo.fetch(req('/status'));
assert.equal((await status.json()).name, 'Test'); ok('status');
assert.equal((await doo.fetch(req('/ws'))).status, 426); ok('plain request refused');

const r = await doo.fetch(req('/ws', true));
assert.equal(r.status, 101);
const server = lastPair[1];
server.emit('message', { data: JSON.stringify({ t: 'join', name: 'Ann', token: 't' }) });
assert.ok(server.sent.some((m) => m.t === 'welcome')); ok('a socket joins and is welcomed');
assert.equal(doo.world.players.size, 1);
server.emit('message', { data: 'not json' }); ok('garbage is ignored');
await new Promise((res) => setTimeout(res, 300));
assert.ok(doo.world.tick_n > 3, 'ticking'); ok('timer ticks while someone is online');
doo.world.setTile(777, 100, 0, 49);
await doo.save();
assert.ok([...st.m.keys()].some((k) => k.startsWith('c:')) && st.m.has('state')); ok('chunks and state are written');
server.emit('close', {});
assert.equal(doo.world.players.size, 0); ok('closing frees the slot');

const doo2 = new WorldDO(mkState(st), env);
await st.ready;
assert.equal(doo2.world.fgAt(777, 100), 49); ok('a fresh object loads the edits back');
assert.ok(doo2.world.accounts.has('ann')); ok('and the players');
// a save that fails keeps the work for the next try
st.put = async () => { throw new Error('disk'); };
doo2.world.setTile(5, 5, 0, 3); doo2.world.chunk(0);
const before = doo2.world.chunks.get(0); before.dirty = true;
await doo2.save();
assert.ok(before.dirty && doo2.world.dirtyState); ok('a failed save is retried later');
clearInterval(doo.timer); clearInterval(doo2.timer);

const redirect = await worker.fetch({ url: 'https://blockmates.me.workers.dev/', method: 'GET', headers: { get: () => null } }, { GAME_URL: 'https://games.example/blockmates/', WORLD: { idFromName: () => 1, get: () => ({ fetch: () => 'forwarded' }) } });
assert.equal(await worker.fetch(req('/ws', true), { WORLD: { idFromName: () => 1, get: () => ({ fetch: () => 'forwarded' }) } }), 'forwarded'); ok('worker forwards /ws to the object');
assert.equal(redirect.status, 302); assert.ok(redirect.location.includes('server=blockmates.me.workers.dev')); ok('root redirects to the game with the server filled in');
console.log(`\n${passed} passed`);
process.exit(0);
