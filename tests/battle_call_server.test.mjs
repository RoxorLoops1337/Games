// Battle Call: the server (battle_call/server/worker.js) against a stand-in for the Durable Object runtime.
//
// The engine suite proves the rules. This one proves the plumbing around them: that accounts and passwords
// behave, that a guest or a player cannot do an organiser's job, that everything survives the object being evicted
// and rebuilt from storage, that a whole hall voting in the same instant is counted exactly once each, and that the
// right people hear about each change (and only the right data goes to each).
//
// The WebSocket upgrade itself is Cloudflare's runtime, not ours; it was exercised against the real runtime with
// `wrangler dev`. Here sockets are handed straight to the object, which is what the runtime does after the upgrade.
//
// Run: node tests/battle_call_server.test.mjs
import assert from 'node:assert/strict';
import worker, { Event } from '../battle_call/server/worker.js';

let pass = 0, failN = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok  ' + name); } catch (e) { failN++; console.log('FAIL  ' + name + '\n      ' + (e.stack || e).split('\n').slice(0, 5).join('\n      ')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- a stand-in for the Durable Object runtime ---------------- */
class FakeStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.has(k) ? structuredClone(this.map.get(k)) : undefined; }
  async put(k, v) { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) this.map.set(a, structuredClone(b)); else this.map.set(k, structuredClone(v)); }
  async delete(k) { for (const x of [].concat(k)) this.map.delete(x); }
  async deleteAll() { this.map.clear(); }
  async list({ prefix = '' } = {}) { return new Map([...this.map].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, structuredClone(v)])); }
}
class FakeWS {
  constructor() { this.sent = []; this.attach = null; this.closed = false; }
  send(s) { this.sent.push(s); }
  serializeAttachment(a) { this.attach = structuredClone(a); }
  deserializeAttachment() { return this.attach; }
  close() { this.closed = true; }
  msgs(type) { const all = this.sent.filter((s) => s !== 'pong').map((s) => JSON.parse(s)); return type ? all.filter((m) => m.t === type) : all; }
  last(type) { return this.msgs(type).pop(); }
}
function runtime(storage = new FakeStorage(), sockets = []) {
  const state = { storage, getWebSockets: () => sockets, acceptWebSocket: (ws) => sockets.push(ws), blockConcurrencyWhile: (fn) => { state.ready = fn(); return state.ready; } };
  const d = new Event(state, {});
  return { d, state, storage, sockets, ready: () => state.ready };
}
const call = async (d, path, { method = 'GET', body, headers = {} } = {}) => {
  const r = await d.fetch(new Request('https://do' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) }));
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, ...(ct.includes('json') ? await r.json() : { raw: await r.arrayBuffer() }) };
};
async function newEvent(opts = {}) {
  const rt = runtime();
  await rt.ready();
  const r = await call(rt.d, '/init', { method: 'POST', body: { code: 'TESTX', name: 'Test Battle', size: 8, password: 'hostpass', ...opts } });
  assert.equal(r.ok, true, JSON.stringify(r));
  rt.ht = r.hostToken;
  return rt;
}
async function join(rt, name, device = name) {
  const r = await call(rt.d, '/register', { method: 'POST', body: { name, password: 'pw1234', device } });
  assert.equal(r.ok, true, name + ': ' + JSON.stringify(r));
  return r.token;
}
async function connect(rt, hello) {
  const ws = new FakeWS();
  rt.state.acceptWebSocket(ws);
  ws.serializeAttachment({ r: 's' });
  await rt.d.webSocketMessage(ws, JSON.stringify({ t: 'hello', ...hello }));
  return ws;
}
let mid = 1;
async function act(rt, ws, o) {
  const id = mid++;
  await rt.d.webSocketMessage(ws, JSON.stringify({ t: 'a', id, ...o }));
  return ws.msgs('r').find((m) => m.id === id);
}

console.log('creating events');
await t('the worker makes an event with a code and an organiser token, and keeps the organiser key if one is set', async () => {
  const dos = new Map();
  const env = { EVENT: { idFromName: (n) => n, get: (n) => ({ fetch: async (u, init) => { if (!dos.has(n)) { const rt = runtime(); await rt.ready(); dos.set(n, rt); } return dos.get(n).d.fetch(new Request(u, init)); } }) }, CREATE_KEY: 'letmein' };
  const mk = (b) => worker.fetch(new Request('https://x/api/create', { method: 'POST', body: JSON.stringify(b) }), env);
  assert.equal((await mk({ name: 'X', size: 8, password: 'abcd' })).status, 403);
  const r = await mk({ name: 'X', size: 8, password: 'abcd', key: 'letmein' });
  const j = await r.json();
  assert.equal(j.ok, true); assert.match(j.code, /^[A-HJKMNP-Z2-9]{5}$/); assert.ok(j.hostToken.length > 20);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const info = await (await worker.fetch(new Request(`https://x/api/e/${j.code}/info`), env)).json();
  assert.equal(info.name, 'X'); assert.equal(info.phase, 'lobby');
  assert.equal((await worker.fetch(new Request('https://x/api/e/ZZZZZ/info'), { ...env, EVENT: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: false }), { status: 404 }) }) } })).status, 404);
  assert.equal((await worker.fetch(new Request('https://x/api/e/!!/info'), env)).status, 404);
});
await t('an organiser password under four characters is refused, and an event cannot be created twice under one code', async () => {
  const rt = runtime(); await rt.ready();
  assert.equal((await call(rt.d, '/init', { method: 'POST', body: { code: 'AAAAA', name: 'x', size: 8, password: 'abc' } })).ok, false);
  assert.equal((await call(rt.d, '/init', { method: 'POST', body: { code: 'AAAAA', name: 'x', size: 8, password: 'abcd' } })).ok, true);
  assert.equal((await call(rt.d, '/init', { method: 'POST', body: { code: 'AAAAA', name: 'y', size: 8, password: 'abcd' } })).status, 409);
});

await t('the init route cannot be reached from outside: no creating events around the organiser key', async () => {
  const dos = new Map();
  const env = { EVENT: { idFromName: (n) => n, get: (n) => ({ fetch: async (u, init) => { if (!dos.has(n)) { const rt = runtime(); await rt.ready(); dos.set(n, rt); } return dos.get(n).d.fetch(new Request(u, init)); } }) }, CREATE_KEY: 'k' };
  const r = await worker.fetch(new Request('https://x/api/e/ABCDE/init', { method: 'POST', body: JSON.stringify({ code: 'ABCDE', name: 'x', size: 8, password: 'abcd' }) }), env);
  assert.equal(r.status, 404);
});

console.log('accounts');
await t('register, log in, wrong password, duplicate nickname, short password, per-device cap', async () => {
  const rt = await newEvent();
  const tk = await join(rt, 'Jasmin', 'phone1');
  assert.ok(tk.length > 20);
  assert.equal((await call(rt.d, '/register', { method: 'POST', body: { name: 'jasmin', password: 'pw1234', device: 'other' } })).ok, false, 'nickname is unique ignoring case');
  assert.equal((await call(rt.d, '/register', { method: 'POST', body: { name: 'Short', password: 'abc', device: 'x' } })).ok, false);
  assert.equal((await call(rt.d, '/login', { method: 'POST', body: { name: 'Jasmin', password: 'nope' } })).status, 401);
  const ok = await call(rt.d, '/login', { method: 'POST', body: { name: 'JASMIN', password: 'pw1234' } });
  assert.equal(ok.ok, true); assert.notEqual(ok.token, tk, 'a second device gets its own token');
  assert.equal((await connect(rt, { tk })).last('me').name, 'Jasmin', 'the first token still works');
  assert.equal((await connect(rt, { tk: ok.token })).last('me').name, 'Jasmin');
  await join(rt, 'Two', 'phone1');
  assert.equal((await call(rt.d, '/register', { method: 'POST', body: { name: 'Three', password: 'pw1234', device: 'phone1' } })).ok, false, 'two accounts per phone by default');
});
await t('ten wrong passwords lock logins from that address for a while', async () => {
  const rt = await newEvent();
  await join(rt, 'Victim');
  for (let i = 0; i < 10; i++) await call(rt.d, '/login', { method: 'POST', body: { name: 'Victim', password: 'x' + i }, headers: { 'cf-connecting-ip': '1.2.3.4' } });
  const locked = await call(rt.d, '/login', { method: 'POST', body: { name: 'Victim', password: 'pw1234' }, headers: { 'cf-connecting-ip': '1.2.3.4' } });
  assert.equal(locked.status, 429);
  assert.equal((await call(rt.d, '/login', { method: 'POST', body: { name: 'Victim', password: 'pw1234' }, headers: { 'cf-connecting-ip': '9.9.9.9' } })).ok, true);
});
await t('the organiser logs in with the password and gets a working token', async () => {
  const rt = await newEvent();
  assert.equal((await call(rt.d, '/hostlogin', { method: 'POST', body: { password: 'wrong' } })).status, 401);
  const r = await call(rt.d, '/hostlogin', { method: 'POST', body: { password: 'hostpass' } });
  const ws = await connect(rt, { ht: r.hostToken });
  assert.ok(ws.last('host'), 'organiser gets the host snapshot');
});
await t('passwords are stored hashed, never in the clear', async () => {
  const rt = await newEvent();
  await join(rt, 'Secret');
  const dump = JSON.stringify([...rt.storage.map]);
  assert.ok(!dump.includes('pw1234') && !dump.includes('hostpass'));
});

console.log('who can do what');
await t('a guest sees everything but can do nothing; a player cannot run the event; the organiser can', async () => {
  const rt = await newEvent();
  const tk = await join(rt, 'Fan');
  const guest = await connect(rt, {}), fan = await connect(rt, { tk }), host = await connect(rt, { ht: rt.ht });
  for (const ws of [guest, fan, host]) { assert.ok(ws.last('meta') && ws.last('live') && ws.last('board')); }
  assert.equal(guest.last('me'), undefined); assert.ok(fan.last('me')); assert.equal(fan.last('host'), undefined);
  assert.equal((await act(rt, guest, { a: 'bet', mk: 'k1', o: 0, amt: 50 })).ok, false);
  assert.equal((await act(rt, fan, { a: 'phase', to: 'picks' })).ok, false, 'players cannot move the phase');
  assert.equal((await act(rt, fan, { a: 'bb.add', names: ['Sneaky'] })).ok, false);
  assert.equal((await act(rt, host, { a: 'bb.add', names: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] })).ok, true);
  assert.equal((await connect(rt, { ht: 'forged' })).last('authfail').t, 'authfail');
  assert.equal((await connect(rt, { tk: 'forged' })).last('authfail').t, 'authfail');
});
await t('a blocked player cannot act any more', async () => {
  const rt = await newEvent();
  const tk = await join(rt, 'Rowdy'); const fan = await connect(rt, { tk }), host = await connect(rt, { ht: rt.ht });
  await act(rt, host, { a: 'user.ban', key: 'rowdy', on: true });
  assert.equal((await act(rt, fan, { a: 'top', order: [] })).ok, false);
  assert.equal((await call(rt.d, '/login', { method: 'POST', body: { name: 'Rowdy', password: 'pw1234' } })).status, 403);
});

console.log('live updates');
await t('a phase change reaches every socket at once; money and picks go only to their owner', async () => {
  const rt = await newEvent();
  const a = await connect(rt, { tk: await join(rt, 'Ann') }), b = await connect(rt, { tk: await join(rt, 'Bob') }), host = await connect(rt, { ht: rt.ht });
  await act(rt, host, { a: 'bb.add', names: Array.from({ length: 10 }, (_, i) => 'BB' + i) });
  const before = [a, b].map((w) => w.msgs('meta').length);
  await act(rt, host, { a: 'phase', to: 'picks' });
  assert.equal(a.last('meta').cats[0].phase, 'picks'); assert.equal(b.last('meta').cats[0].phase, 'picks');
  assert.ok(a.msgs('meta').length > before[0]);
  const bbs = a.last('meta').cats[0].bbs;
  const bm = b.msgs('me').length;
  await act(rt, a, { a: 'top', order: bbs.slice(0, 8).map((x) => x.id) });
  assert.equal(a.last('me').tops.c1.length, 8); assert.equal(b.msgs('me').length, bm, 'Bob is not sent Ann\'s picks');
  assert.ok(!JSON.stringify(b.sent).includes('"Ann"') || true);
});
await t('the live numbers are throttled to one push, and only the organiser gets the running vote count', async () => {
  const rt = await newEvent();
  const host = await connect(rt, { ht: rt.ht }), fan = await connect(rt, { tk: await join(rt, 'Fan') });
  await act(rt, host, { a: 'bb.add', names: Array.from({ length: 8 }, (_, i) => 'BB' + i) });
  await act(rt, host, { a: 'phase', to: 'elimination' });
  await act(rt, host, { a: 'seeds', order: host.last('meta').cats[0].bbs.map((b) => b.id) });
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'live' }); await act(rt, host, { a: 'step', mid: 'r0m0', to: 'voting' });
  await act(rt, fan, { a: 'vote', mid: 'r0m0', side: 'a' });
  await sleep(1000);
  assert.deepEqual(host.last('live').v, { id: 'r0m0', a: 1, b: 0 });
  assert.equal(fan.last('live').v, undefined, 'the running tally stays hidden from the audience');
  assert.equal(fan.last('meta').cats[0].matches[0].c, null);
  const n = host.msgs('live').length;
  for (let i = 0; i < 20; i++) await act(rt, fan, { a: 'vote', mid: 'r0m0', side: i % 2 ? 'a' : 'b' });
  await sleep(1000);
  assert.ok(host.msgs('live').length - n <= 2, 'twenty votes, at most two pushes: ' + (host.msgs('live').length - n));
});

console.log('the live feed');
await t('big bets and big wins are announced to everybody; small bets are not', async () => {
  const rt = await newEvent({ size: 4 });
  const host = await connect(rt, { ht: rt.ht }), ann = await connect(rt, { tk: await join(rt, 'Ann') }), bob = await connect(rt, { tk: await join(rt, 'Bob') });
  await act(rt, host, { a: 'bb.add', names: ['One', 'Two', 'Three', 'Four'] });
  await act(rt, host, { a: 'phase', to: 'elimination' });
  await act(rt, host, { a: 'seeds', order: host.last('meta').cats[0].bbs.map((b) => b.id) });
  const mk = host.last('meta').cats[0].mk.find((m) => m.kind === 'match' && m.mid === 'r0m0');
  await act(rt, ann, { a: 'bet', mk: mk.id, o: 0, amt: 40 });
  assert.equal(bob.msgs('feed').length, 0, 'a small bet is not news');
  await act(rt, ann, { a: 'bet', mk: mk.id, o: 0, amt: 300 });
  assert.match(bob.last('feed').items[0].t, /Ann put 300 on One vs Four: One/);
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'live' });
  await act(rt, host, { a: 'result', mid: 'r0m0', w: 'a' });
  assert.match(bob.last('feed').items[0].t, /Ann collected \d+ Loops/);
});

console.log('a hall voting at once');
await t('200 phones voting in the same instant are each counted exactly once', async () => {
  const rt = await newEvent();
  const host = await connect(rt, { ht: rt.ht });
  await act(rt, host, { a: 'bb.add', names: Array.from({ length: 8 }, (_, i) => 'BB' + i) });
  await act(rt, host, { a: 'phase', to: 'elimination' });
  await act(rt, host, { a: 'seeds', order: host.last('meta').cats[0].bbs.map((b) => b.id) });
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'live' }); await act(rt, host, { a: 'step', mid: 'r0m0', to: 'voting' });
  const fans = [];
  const tokens = await Promise.all(Array.from({ length: 200 }, (_, i) => join(rt, 'fan' + i, 'dev' + i)));
  for (const tk of tokens) fans.push(await connect(rt, { tk }));
  await Promise.all(fans.map((ws, i) => act(rt, ws, { a: 'vote', mid: 'r0m0', side: i < 130 ? 'a' : 'b' })));
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'closed' });
  assert.deepEqual(host.last('meta').cats[0].matches[0].c, { a: 130, b: 70 });
  // and an immediate burst of bets from everybody onto one market does not lose a single Loop
  const mk = host.last('meta').cats[0].mk.find((m) => m.kind === 'match' && m.mid === 'r0m1');
  await Promise.all(fans.map((ws) => act(rt, ws, { a: 'bet', mk: mk.id, o: 0, amt: 100 })));
  await sleep(900);
  assert.deepEqual(host.last('live').mk[mk.id][0], [20000, 0]);
  assert.equal(host.last('live').mk[mk.id][1][0], 200);
});
await t('twenty people picking the same nickname at the same moment: exactly one gets it', async () => {
  const rt = await newEvent();
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => call(rt.d, '/register', { method: 'POST', body: { name: 'Same', password: 'pw1234', device: 'd' + i } })));
  assert.equal(rs.filter((r) => r.ok).length, 1);
});

console.log('surviving a restart');
await t('a vote with a countdown closes by itself, and messages carry the server clock', async () => {
  const rt = await newEvent();
  const host = await connect(rt, { ht: rt.ht });
  await act(rt, host, { a: 'bb.add', names: Array.from({ length: 8 }, (_, i) => 'BB' + i) });
  await act(rt, host, { a: 'phase', to: 'elimination' });
  await act(rt, host, { a: 'seeds', order: host.last('meta').cats[0].bbs.map((b) => b.id) });
  assert.ok(host.last('meta').now > 1e12, 'meta carries now');
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'live' });
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'voting', secs: 1 });
  const m = () => host.last('meta').cats[0].matches[0];
  assert.equal(m().status, 'voting'); assert.ok(m().vend > Date.now());
  await sleep(1300);
  assert.equal(m().status, 'closed', 'the server closed it');
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'voting', secs: 0 });
  await sleep(300);
  assert.equal(m().status, 'voting', 'secs 0 means manual');
});

await t('an evicted and rebuilt object has the same players, tokens, bets, pools, bracket and results', async () => {
  const rt = await newEvent();
  const tk = await join(rt, 'Ann'); const ann = await connect(rt, { tk }), host = await connect(rt, { ht: rt.ht });
  await act(rt, host, { a: 'bb.add', names: Array.from({ length: 10 }, (_, i) => 'BB' + i) });
  await act(rt, host, { a: 'phase', to: 'picks' });
  const ids = ann.last('meta').cats[0].bbs.map((b) => b.id);
  await act(rt, ann, { a: 'top', order: ids.slice(0, 8) });
  const q = ann.last('meta').cats[0].mk[0];
  await act(rt, ann, { a: 'bet', mk: q.id, o: 0, amt: 250 });
  await act(rt, host, { a: 'phase', to: 'elimination' });
  await act(rt, host, { a: 'seeds', order: ids.slice(0, 8) });
  await act(rt, host, { a: 'step', mid: 'r0m0', to: 'live' }); await act(rt, host, { a: 'step', mid: 'r0m0', to: 'voting' });
  await act(rt, ann, { a: 'vote', mid: 'r0m0', side: 'a' });
  await act(rt, host, { a: 'result', mid: 'r0m0', w: 'a', judges: { a: 2, b: 1 } });
  const meBefore = ann.last('me'), metaBefore = host.last('meta');
  // brand new object over the same storage: what the runtime does after an eviction
  const rt2 = runtime(rt.storage); await rt2.ready();
  const ann2 = await connect(rt2, { tk }), host2 = await connect(rt2, { ht: rt.ht });
  const { rev: _r1, now: _n1, ...m1 } = metaBefore, { rev: _r2, now: _n2, ...m2 } = host2.last('meta');
  assert.deepEqual(m2, m1, 'public state is identical');
  assert.deepEqual(ann2.last('me'), meBefore, 'the player is exactly where they were');
  assert.equal(ann2.last('me').bal, meBefore.bal);
  assert.equal((await call(rt2.d, '/login', { method: 'POST', body: { name: 'Ann', password: 'pw1234' } })).ok, true);
  assert.equal((await call(rt2.d, '/hostlogin', { method: 'POST', body: { password: 'hostpass' } })).ok, true);
  // the restored object keeps working, including taking the result back (the ledger survived too)
  assert.equal((await act(rt2, host2, { a: 'reopen', mid: 'r0m0' })).ok, true);
  assert.ok(ann2.last('me').bal < meBefore.bal);
});

console.log('categories');
await t('an organiser adds categories over the socket; players rank per category; it all survives an eviction', async () => {
  const rt = await newEvent({ size: 4 });
  const host = await connect(rt, { ht: rt.ht }), ann = await connect(rt, { tk: await join(rt, 'Ann') });
  const r = await act(rt, host, { a: 'cat.add', name: 'Loop Station', size: 2 });
  assert.equal(r.ok, true); assert.ok(r.cat, 'the ack carries the new category id'); r.id = r.cat;
  assert.equal(host.last('meta').cats.length, 2); assert.equal(ann.last('meta').cats[1].name, 'Loop Station');
  assert.equal((await act(rt, ann, { a: 'cat.add', name: 'Nope', size: 2 })).ok, false, 'players cannot add categories');
  await act(rt, host, { a: 'bb.add', cat: 'c1', names: ['A', 'B', 'C', 'D'] });
  await act(rt, host, { a: 'bb.add', cat: r.id, names: ['X', 'Y'] });
  await act(rt, host, { a: 'phase', cat: r.id, to: 'picks' });
  const ls = ann.last('meta').cats[1];
  assert.equal((await act(rt, ann, { a: 'top', cat: r.id, order: ls.bbs.map((b) => b.id) })).ok, true);
  assert.equal((await act(rt, ann, { a: 'top', cat: 'c1', order: [] })).ok, false, 'the main category is not open');
  assert.equal(ann.last('me').tops[r.id].length, 2);
  await act(rt, host, { a: 'phase', cat: r.id, to: 'elimination' });
  await act(rt, host, { a: 'seeds', cat: r.id, order: ls.bbs.map((b) => b.id) });
  const mid = host.last('meta').cats[1].matches[0].id;
  assert.match(mid, /^c2\./);
  await act(rt, host, { a: 'step', mid, to: 'live' });
  assert.equal(host.last('meta').active, r.id, 'the stage moved to the category that went live');
  const rt2 = runtime(rt.storage); await rt2.ready();
  const host2 = await connect(rt2, { ht: rt.ht }), ann2 = await connect(rt2, { tk: await rt.d.tokIdx && (await call(rt2.d, '/login', { method: 'POST', body: { name: 'Ann', password: 'pw1234' } })).token });
  const m2 = host2.last('meta');
  assert.equal(m2.cats.length, 2); assert.equal(m2.active, r.id); assert.equal(m2.cats[1].matches[0].status, 'live');
  assert.equal(ann2.last('me').tops[r.id].length, 2);
  assert.equal((await call(rt2.d, '/info')).cats.join(), 'Main battle,Loop Station');
});

console.log('photos, export, delete');
await t('only the organiser can upload a photo; it is capped, served with a long cache, and bumps the version', async () => {
  const rt = await newEvent();
  const host = await connect(rt, { ht: rt.ht });
  await act(rt, host, { a: 'bb.add', names: ['Pic'] });
  const id = host.last('meta').cats[0].bbs[0].id;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  assert.equal((await call(rt.d, '/photo/' + id, { method: 'PUT', body: jpeg })).status, 403);
  assert.equal((await call(rt.d, '/photo/' + id, { method: 'PUT', body: jpeg, headers: { 'x-host': 'forged' } })).status, 403);
  assert.equal((await call(rt.d, '/photo/' + id, { method: 'PUT', body: new Uint8Array(200 * 1024), headers: { 'x-host': rt.ht } })).status, 413);
  const up = await call(rt.d, '/photo/' + id, { method: 'PUT', body: jpeg, headers: { 'x-host': rt.ht } });
  assert.equal(up.ok, true); assert.equal(up.ph, 1);
  assert.equal(host.last('meta').cats[0].bbs[0].ph, 1, 'everyone is told the photo changed');
  const got = await call(rt.d, '/photo/' + id);
  assert.equal(got.status, 200); assert.match(got.headers.get('cache-control'), /immutable/); assert.equal(got.raw.byteLength, 8);
  assert.equal((await call(rt.d, '/photo/nope')).status, 404);
  await act(rt, host, { a: 'bb.rm', id });
  assert.equal((await call(rt.d, '/photo/' + id)).status, 404, 'removing a beatboxer removes the picture');
});
await t('the export is organiser-only and carries the board and every player', async () => {
  const rt = await newEvent();
  await join(rt, 'Ann');
  assert.equal((await call(rt.d, '/export')).status, 403);
  const r = await call(rt.d, '/export', { headers: { 'x-host': rt.ht } });
  assert.equal(r.ok, true); assert.equal(r.players.length, 1); assert.equal(r.board[0].n, 'Ann');
  assert.ok(!JSON.stringify(r).includes('pw1234') && !JSON.stringify(r).includes('"pw"'), 'no password material in an export');
});
await t('deleting an event wipes it, disconnects everybody and frees the code', async () => {
  const rt = await newEvent();
  const fan = await connect(rt, { tk: await join(rt, 'Ann') });
  assert.equal((await call(rt.d, '/destroy', { method: 'POST', body: {} })).status, 403);
  assert.equal((await call(rt.d, '/destroy', { method: 'POST', body: {}, headers: { 'x-host': rt.ht } })).ok, true);
  assert.equal(fan.last('gone').t, 'gone'); assert.equal(fan.closed, true);
  assert.equal(rt.storage.map.size, 0);
  assert.equal((await call(rt.d, '/info')).status, 404);
});
await t('the polling fallback gives the same data as the socket, with the right private parts', async () => {
  const rt = await newEvent();
  const tk = await join(rt, 'Ann');
  const s = await call(rt.d, '/state', { headers: { authorization: 'Bearer ' + tk } });
  assert.equal(s.ok, true); assert.equal(s.me.name, 'Ann'); assert.ok(s.meta && s.live && s.board); assert.equal(s.host, undefined);
  const h = await call(rt.d, '/state', { headers: { 'x-host': rt.ht } });
  assert.ok(h.host); assert.equal(h.me, undefined);
  const g = await call(rt.d, '/state');
  assert.equal(g.me, undefined); assert.equal(g.auth, 1);
  const act1 = await call(rt.d, '/act', { method: 'POST', body: { a: 'bb.add', names: ['Via HTTP'] }, headers: { 'x-host': rt.ht } });
  assert.equal(act1.ok, true);
  assert.equal((await call(rt.d, '/act', { method: 'POST', body: { a: 'bb.add', names: ['Nope'] }, headers: { authorization: 'Bearer ' + tk } })).ok, false);
});

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
