// Ironbridge relay — headless suite for the Cloudflare Worker.
//
// The Worker runs on workerd and talks to Durable Object APIs that do not exist
// in Node, so this stubs the four things it actually touches — WebSocketPair,
// the hibernation calls on `state`, `state.storage`, and `crypto` — and drives
// the real module. What is being checked is not "does Cloudflare work" but the
// two properties the game depends on: that seats and the seed are handed out
// correctly, and that the relay stays ignorant of what it is carrying.
//
// Run: node tests/ironbridge_relay.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', 'ironbridge-relay');
const SRC = readFileSync(join(ROOT, 'src', 'index.js'), 'utf8');
const TOML = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8');

/* ---------------------------------------------------------------- stubs */
// A socket pair whose two ends really are joined: what one sends, the other
// hears. The refused-third-player path never gets accepted into the room, so
// the only way to see what it was told is through its own end of the pair.
class FakeWS {
  constructor(name){
    this.name = name; this.sent = []; this.got = [];
    this.closed = null; this.readyState = 1; this.attach = null; this.peer = null;
  }
  accept(){ this.accepted = true; }
  send(m){ if (this.readyState !== 1) throw new Error('closed'); this.sent.push(m); if (this.peer) this.peer.got.push(m); }
  close(code, reason){ this.readyState = 3; this.closed = { code, reason }; if (this.peer && !this.peer.closed) this.peer.closed = { code, reason }; }
  serializeAttachment(v){ this.attach = v; }
  deserializeAttachment(){ return this.attach; }
  msgs(){ return this.sent.map(s => JSON.parse(s)); }
  heard(){ return this.got.map(s => JSON.parse(s)); }
  last(){ const m = this.msgs(); return m[m.length - 1]; }
}
global.WebSocketPair = function(){
  const a = new FakeWS('client'), b = new FakeWS('server');
  a.peer = b; b.peer = a;
  return { 0:a, 1:b };
};
if (!global.crypto || !global.crypto.getRandomValues){
  global.crypto = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 4294967296) >>> 0; return a; } };
}

function fakeState(){
  const sockets = [];
  const store = new Map();
  return {
    sockets,
    acceptWebSocket(ws){ ws.accepted = true; sockets.push(ws); },
    getWebSockets(){ return sockets.slice(); },
    storage: {
      async get(k){ return store.get(k); },
      async put(k, v){ store.set(k, v); },
    },
  };
}

const { Room, makeCode, default: worker } = await import(join(ROOT, 'src', 'index.js'));

// A room, plus a helper that performs a join the way the Worker's fetch does.
function mkRoom(){
  const state = fakeState();
  const room = new Room(state, {});
  return {
    room, state,
    async join(code){
      const res = await room.fetch(new Request('https://relay/room?code=' + (code || 'ABCD'), {
        headers: { Upgrade: 'websocket' },
      }));
      // the server half is the one the DO kept
      const server = state.sockets[state.sockets.length - 1];
      return { res, client: res.webSocket, server };
    },
    async status(){
      const r = await room.fetch(new Request('https://relay/room?code=ABCD'));
      return r.json();
    },
  };
}

// Response in Node has no `webSocket` option, so carry it ourselves.
const RealResponse = global.Response;
global.Response = class extends RealResponse {
  constructor(body, init){ super(body, init && init.status === 101 ? { status:200 } : init); this.webSocket = init && init.webSocket; this._status = init && init.status; }
};

const t = harness('ironbridge-relay');

/* ---------------------------------------------------------------- codes */
{
  const c = makeCode();
  t.ok(/^[A-Z]{4}$/.test(c), 'a room code is four capital letters (' + c + ')');
  let seq = [0, 0.5, 0.99, 0.25], i = 0;
  const fixed = makeCode(() => seq[i++]);
  t.ok(/^[A-Z]{4}$/.test(fixed), 'makeCode is drivable from a supplied source of randomness');
  t.ok(makeCode(() => 0) === makeCode(() => 0), 'and the same randomness gives the same code');
  const many = new Set();
  for (let n = 0; n < 400; n++) many.add(makeCode());
  t.ok(many.size > 380, 'codes are spread out rather than clustering (' + many.size + '/400 unique)');
  const letters = new Set([...many].join(''));
  t.ok(!letters.has('I') && !letters.has('O'), 'I and O are kept out of codes — they get misread aloud');
}

/* ---------------------------------------------------------------- seating */
{
  const R = mkRoom();
  const a = await R.join('ABCD');
  t.ok(a.server.attach && a.server.attach.seat === 0, 'the first player to arrive gets seat 0');
  const first = a.server.msgs()[0];
  t.ok(first && first.t === 'seat', 'and is told its seat straight away');
  t.ok(first.me === 0 && typeof first.seed === 'number', 'the seat message carries the seat and the match seed');
  t.ok(first.code === 'ABCD', 'and the room code it landed in');
  t.ok(!a.server.msgs().some(m => m.t === 'go'), 'one player alone is not told to start');

  const b = await R.join('ABCD');
  t.ok(b.server.attach.seat === 1, 'the second player gets seat 1');
  const bSeat = b.server.msgs()[0];
  t.ok(bSeat.seed === first.seed, 'both players are given the SAME seed — this is what makes it one match');
  t.ok(a.server.last().t === 'go' && b.server.last().t === 'go', 'both are told to start once the room is full');

  // A third window is refused, not left hanging.
  const c = await R.join('ABCD');
  t.ok(c.res.webSocket.heard()[0] && c.res.webSocket.heard()[0].t === 'full', 'a third player is told the match is full');
  t.ok(c.res.webSocket.closed && c.res.webSocket.closed.code === 4001, 'and its socket is closed rather than left hanging');
  t.ok(R.state.sockets.length === 2, 'the refused socket is never accepted into the room');
}

/* ---------------------------------------------------------------- relaying */
{
  const R = mkRoom();
  const a = await R.join(); const b = await R.join();
  a.server.sent.length = 0; b.server.sent.length = 0;

  const orders = JSON.stringify({ t:'c', n:7, c:[['build', 3, 'farm'], ['worker']] });
  R.room.webSocketMessage(a.server, orders);
  t.ok(b.server.sent.length === 1 && b.server.sent[0] === orders, 'an orders message reaches the other player byte for byte');
  t.ok(a.server.sent.length === 0, 'and is not echoed back to the player who sent it');

  const hash = JSON.stringify({ t:'h', n:7, h:123456 });
  R.room.webSocketMessage(b.server, hash);
  t.ok(a.server.sent.length === 1 && a.server.sent[0] === hash, 'a hash message goes the other way just as opaquely');

  // The relay must not care what it is carrying.
  b.server.sent.length = 0;
  const nonsense = 'this is not even JSON';
  R.room.webSocketMessage(a.server, nonsense);
  t.ok(b.server.sent[0] === nonsense, 'the relay forwards something it cannot parse — it never reads the payload');

  b.server.sent.length = 0;
  R.room.webSocketMessage(a.server, 'x'.repeat(9000));
  t.ok(b.server.sent.length === 0, 'a message far larger than any real one is dropped');

  b.server.sent.length = 0;
  R.room.webSocketMessage(a.server, new ArrayBuffer(8));
  t.ok(b.server.sent.length === 0, 'a binary frame is dropped — orders are JSON text');
}

/* ---------------------------------------------------------------- leaving */
{
  const R = mkRoom();
  const a = await R.join(); const b = await R.join();
  a.server.sent.length = 0; b.server.sent.length = 0;
  b.server.readyState = 3;
  R.room.webSocketClose(b.server);
  t.ok(a.server.last() && a.server.last().t === 'bye', 'when one player goes, the other is told');
  t.ok(b.server.sent.length === 0, 'and the player who left is not told about themselves');
}
{
  const R = mkRoom();
  const a = await R.join(); const b = await R.join();
  a.server.sent.length = 0;
  b.server.readyState = 3;
  R.room.webSocketError(b.server);
  t.ok(a.server.last().t === 'bye', 'a socket that errors out counts as leaving too');
}

/* ---------------------------------------------------------------- occupancy */
{
  const R = mkRoom();
  let st = await R.status();
  t.ok(st.free === true && st.players === 0, 'an empty room reports itself free');
  await R.join();
  st = await R.status();
  t.ok(st.free === false && st.players === 1, 'a room with somebody in it does not');
  t.ok(R.state.sockets.length === 1, 'and asking did not open a socket');
}

/* ---------------------------------------------------------------- the seed */
{
  const R = mkRoom();
  const s1 = await R.room.seed();
  const s2 = await R.room.seed();
  t.ok(s1 === s2, 'the seed is minted once and never changes under a live match');
  t.ok(Number.isInteger(s1) && s1 >= 0 && s1 <= 0xFFFFFFFF, 'and is a plain 32-bit number the game can reseed from');
  // A second room mints independently. Two 32-bit draws colliding is a one in
  // four billion event, so this is worth asserting rather than hand-waving.
  const seeds = new Set();
  for (let i = 0; i < 8; i++) seeds.add(await mkRoom().room.seed());
  t.ok(seeds.size === 8, 'separate rooms mint separate seeds (' + seeds.size + '/8 distinct)');
}

/* ---------------------------------------------------------------- routing */
{
  const rooms = new Map();
  const env = { ROOMS: {
    idFromName: (n) => n,
    get: (id) => { if (!rooms.has(id)) rooms.set(id, new Room(fakeState(), {})); return rooms.get(id); },
  } };
  const r = await worker.fetch(new Request('https://relay/new', { method:'POST' }), env);
  const j = await r.json();
  t.ok(/^[A-Z]{4}$/.test(j.code), 'POST /new answers with a four-letter code (' + j.code + ')');
  t.ok(rooms.has(j.code), 'and the code it gave out is one it actually checked was free');

  const h = await worker.fetch(new Request('https://relay/health'), env);
  t.ok((await h.json()).ok === true, 'GET /health answers');

  const miss = await worker.fetch(new Request('https://relay/nope'), env);
  t.ok(miss.status === 404, 'an unknown path is a 404');

  const bad = await worker.fetch(new Request('https://relay/room/1234'), env);
  t.ok(bad.status === 404, 'a room code that is not letters does not reach a Durable Object');

  const lower = await worker.fetch(new Request('https://relay/room/abcd'), env);
  t.ok(rooms.has('ABCD'), 'a lower-case code reaches the same room as the upper-case one');
  t.ok(!!lower, 'and answers');

  // /new must not hand out a code whose room is already occupied.
  const busy = new Room(fakeState(), {});
  await busy.fetch(new Request('https://relay/room?code=ZZZZ', { headers:{ Upgrade:'websocket' } }));
  let calls = 0;
  const env2 = { ROOMS: {
    idFromName: (n) => n,
    get: () => (calls++ === 0 ? busy : new Room(fakeState(), {})),
  } };
  const r2 = await worker.fetch(new Request('https://relay/new', { method:'POST' }), env2);
  t.ok(r2.status === 200 && calls === 2, 'when the first code drawn is busy, /new draws another instead of failing');

  // And if every code it draws is taken, it says so rather than handing out a
  // room somebody is already sitting in.
  const envFull = { ROOMS: { idFromName:(n) => n, get: () => busy } };
  const r3 = await worker.fetch(new Request('https://relay/new', { method:'POST' }), envFull);
  t.ok(r3.status === 503, 'and gives up with an error if every code it tries is occupied');
}

/* ---------------------------------------------------------------- the config */
{
  t.ok(/new_sqlite_classes\s*=\s*\[\s*"Room"\s*\]/.test(TOML),
    'wrangler.toml migrates Room with new_sqlite_classes — the backend that is free');
  t.ok(!/^\s*new_classes\s*=/m.test(TOML),
    'and never with new_classes, which is the paid-plan key-value backend');
  t.ok(/class_name\s*=\s*"Room"/.test(TOML) && /name\s*=\s*"ROOMS"/.test(TOML),
    'the binding the Worker reads as env.ROOMS is the one declared');
  t.ok(/main\s*=\s*"src\/index\.js"/.test(TOML), 'and it points at the file this suite just tested');

  const build = readFileSync(join(here, '..', 'build.js'), 'utf8');
  t.ok(!/ironbridge-relay/.test(build),
    'build.js does not copy the relay into dist/ — it is a Worker, not site content');
}

/* ---------------------------------------------------------------- ignorance */
// The relay's whole safety property is that it cannot disagree with the game,
// because it does not know the game. If any of these words ever appear in it,
// somebody has started teaching it the rules.
{
  const verbs = ['nodeup', 'trainUnit', 'upgradeBuilding', 'createHero', 'pickOption',
                 'barracks', 'gold', 'wave', 'hero', 'tick'];
  const found = verbs.filter(v => new RegExp('\\b' + v + '\\b').test(SRC));
  t.ok(found.length === 0, 'the relay contains no game vocabulary (found: ' + found.join(', ') + ')');
  t.ok(!/JSON\.parse/.test(SRC.split('webSocketMessage')[1] || ''),
    'and never parses a message it is forwarding');
}

t.done();
