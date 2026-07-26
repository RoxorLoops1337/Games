// Ironbridge relay — the Cloudflare Worker that introduces two browsers.
//
// The relay is deliberately ignorant: it holds two sockets, hands out a seed
// and a side, and copies bytes. So the things worth testing are exactly the
// things it IS authoritative about — the room code alphabet, who gets which
// side, that a third player is refused rather than silently ignored, that a
// disconnect frees the right side and a rejoin gets the SAME one back, and
// that a message is relayed to the peer and not echoed to the sender.
//
// Run: node tests/ironbridge_relay.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, '..', 'ironbridge-relay', 'worker.js'), 'utf8');
const TOML = readFileSync(join(here, '..', 'ironbridge-relay', 'wrangler.toml'), 'utf8');

// WebSocketPair is a Cloudflare global. Everything else the worker touches
// (Response, URL, crypto.getRandomValues) Node already has.
class FakeWS {
  constructor(tag){ this.tag = tag; this.sent = []; this.attach = null; this.closed = false; }
  send(s){ if (this.closed) throw new Error('closed'); this.sent.push(s); }
  serializeAttachment(a){ this.attach = a; }
  deserializeAttachment(){ return this.attach; }
  msgs(){ return this.sent.map(x => JSON.parse(x)); }
  last(k){ return this.msgs().filter(m => m.k === k).pop(); }
}
globalThis.WebSocketPair = function(){ const a = new FakeWS('client'), b = new FakeWS('server'); return { 0:a, 1:b }; };

// Node's Response refuses status 101 outright — but 101 is exactly what a
// Cloudflare WebSocket upgrade returns, so the real worker cannot be exercised
// through it. A small stand-in with the three things the worker and these
// assertions use. If this ever hides a difference that matters, it will be
// because the worker started depending on real Response behaviour, which it has
// no reason to do.
globalThis.Response = class FakeResponse {
  constructor(body, init){
    const i = init || {};
    this.body = body;
    this.status = i.status === undefined ? 200 : i.status;
    this.headers = new Map(Object.entries(i.headers || {}));
    this.webSocket = i.webSocket;
  }
  async json(){ return JSON.parse(this.body); }
  async text(){ return String(this.body); }
};

const mod = await import('../ironbridge-relay/worker.js');
const { Room } = mod;
const worker = mod.default;

// A stand-in for the Durable Object runtime: real storage semantics (a Map),
// real socket list, and — the part that matters — an eviction we can trigger,
// because hibernation is the failure mode that only shows up in production.
function mkState(){
  const store = new Map(), socks = [];
  return {
    storage: { get:async k => store.get(k), put:async (k, v) => { store.set(k, JSON.parse(JSON.stringify(v))); } },
    getWebSockets: () => socks.filter(w => !w.closed),
    acceptWebSocket: (ws) => { socks.push(ws); },
    __socks: socks,
    __store: store,
  };
}
const upgrade = new Request('https://x/room/ABCD', { headers:{ Upgrade:'websocket' } });
const joinRoom = (room) => room.fetch(upgrade);

const t = harness('ironbridge relay');

/* ------------------------------------------------------------- room codes */
{
  // The code gets read aloud down a phone and typed from a photo, so the
  // characters that get misheard or mistyped must not be in the alphabet.
  const alpha = SRC.match(/const ALPHABET = '([A-Z]+)'/)[1];
  t.ok(alpha.length >= 20, 'the alphabet is big enough to be worth four characters (' + alpha.length + ')');
  for (const bad of ['O', 'I'])
    t.ok(!alpha.includes(bad), '"' + bad + '" is not in the alphabet, because it is read as a digit');
  t.ok(!/[0-9]/.test(alpha), 'and there are no digits at all, so there is nothing for a letter to be confused with');
  t.ok(Math.pow(alpha.length, 4) > 300000,
    'four characters is ' + Math.pow(alpha.length, 4).toLocaleString() + ' rooms, so a guess is not a strategy');

  // Codes must actually vary. A generator that returned a constant would pass
  // every other assertion in this block.
  const seen = new Set();
  for (let i = 0; i < 400; i++){
    const r = await worker.fetch(new Request('https://x/new', { method:'POST' }), {});
    seen.add((await r.json()).code);
  }
  t.ok(seen.size > 380, 'four hundred codes are essentially all different (' + seen.size + ')');
  for (const c of seen) if (!/^[A-Z]{4}$/.test(c) || [...c].some(ch => !alpha.includes(ch)))
    throw new Error('code outside the alphabet: ' + c);
  t.ok(true, 'and every one of them is four characters from that alphabet');
}

/* -------------------------------------------------------------- the door */
{
  const env = { ROOM:{ idFromName:(n) => n, get:() => ({ fetch:async () => new Response('ok') }) } };
  const get = (p, init) => worker.fetch(new Request('https://x' + p, init), env);

  t.ok((await get('/nope')).status === 404, 'an unknown path is a 404');
  t.ok((await get('/room/ABCD')).status === 426,
    'asking for a room without a websocket upgrade is refused, not left hanging');
  t.ok((await get('/room/AB')).status === 400, 'a code of the wrong length is refused');
  t.ok((await get('/room/ABIO')).status === 400,
    'and so is one using characters the alphabet excludes, rather than being silently remapped');
  const ok = await get('/room/ABCD', { headers:{ Upgrade:'websocket' } });
  t.ok(ok.status === 200, 'a well-formed request reaches the room');

  // Case and punctuation are a player typing, not an attack. Same room.
  const names = [];
  const env2 = { ROOM:{ idFromName:(n) => { names.push(n); return n; },
    get:() => ({ fetch:async () => new Response('ok') }) } };
  for (const p of ['/room/abcd', '/room/ABCD', '/room/AbCd'])
    await worker.fetch(new Request('https://x' + p, { headers:{ Upgrade:'websocket' } }), env2);
  t.ok(names.length === 3 && new Set(names).size === 1,
    'the same code typed three ways reaches one room (' + names.join(', ') + ')');
}

/* ------------------------------------------------------- sides and seats */
{
  const st = mkState();
  const room = new Room(st, {});
  await joinRoom(room);
  const a = st.__socks[0];
  t.ok(a.last('hello').side === 0, 'the first to arrive is side 0');
  t.ok(!a.last('start'), 'and is not told to start, because there is nobody to play');
  t.ok(a.last('peers').n === 1, 'and is told it is alone');

  await joinRoom(room);
  const b = st.__socks[1];
  t.ok(b.last('hello').side === 1, 'the second is side 1');
  t.ok(!!a.last('start') && !!b.last('start'), 'and now both are told to start');
  t.ok(a.last('start').seed === b.last('start').seed,
    'on the same seed (' + a.last('start').seed + ')');
  t.ok(a.last('start').side !== b.last('start').side, 'and different sides');
  t.ok(Number.isInteger(a.last('start').seed) && a.last('start').seed > 0,
    'the seed is a positive integer, which is what reseed() needs');

  // A third player must be refused out loud. A socket that connects and then
  // receives nothing is the worst version of this.
  const third = await joinRoom(room);
  t.ok(third.status === 409, 'a third player is refused with a status, not left connected and silent (' + third.status + ')');
}

/* --------------------------------------------------------------- relaying */
{
  const st = mkState();
  const room = new Room(st, {});
  await joinRoom(room); await joinRoom(room);
  const [a, b] = st.__socks;
  const beforeA = a.sent.length, beforeB = b.sent.length;

  const payload = JSON.stringify({ k:'cmd', tick:12, side:0, cmds:[{ type:'job', node:'gold', d:1, side:0, seq:0 }] });
  await room.webSocketMessage(a, payload);
  t.ok(b.sent.length === beforeB + 1 && b.sent[b.sent.length - 1] === payload,
    'a message reaches the other player byte for byte');
  t.ok(a.sent.length === beforeA, 'and is not echoed back to the sender, who already has it');

  // The relay must not care what is inside. If it ever starts parsing
  // commands, the rules live in two places and one of them will be wrong.
  const junk = '{"k":"cmd","cmds":[{"type":"nonsense"}],"tick":"not a number"}';
  await room.webSocketMessage(a, junk);
  t.ok(b.sent[b.sent.length - 1] === junk, 'nonsense is relayed unchanged rather than judged');

  const huge = 'x'.repeat(20000);
  const n = b.sent.length;
  await room.webSocketMessage(a, huge);
  t.ok(b.sent.length === n, 'but something far too large to be a command is dropped');

  await room.webSocketMessage(a, '"ping"');
  t.ok(!!a.last('pong'), 'a ping comes back, so a client can tell a thinking peer from a dead link');
}

/* --------------------------------------------- leaving, and coming back */
{
  const st = mkState();
  const room = new Room(st, {});
  await joinRoom(room); await joinRoom(room);
  const [a, b] = st.__socks;
  const seed = a.last('start').seed;

  a.closed = true;
  await room.webSocketClose(a);
  t.ok(b.last('peerGone').side === 0, 'the one still here is told which side left');

  // The important one. Sides are claimed and released, not counted — if the
  // room handed out "the next free side" by counting sockets, the player who
  // dropped would come back as their opponent and inherit the wrong hold.
  await joinRoom(room);
  const a2 = st.__socks[st.__socks.length - 1];
  t.ok(a2.last('hello').side === 0, 'and the player who left gets their OWN side back, not the free one');
  t.ok(a2.last('hello').seed === seed, 'on the same seed, so it is the same match resumed');

  // The room survives eviction: a hibernated object rebuilds from storage, so
  // the seed cannot be re-rolled underneath a match in progress.
  const cold = new Room({ ...st, __socks:st.__socks }, {});
  t.ok((await cold.meta()).seed === seed,
    'and a room rebuilt from storage after hibernation keeps the seed (' + (await cold.meta()).seed + ')');
  t.ok((await cold.meta()).started === true, 'and remembers that the match already started');
}

/* --------------------------------------------------------- configuration */
{
  // Durable Objects are only free on the SQLite backend, and the thing that
  // selects it is the migration key. new_classes deploys fine on a paid
  // account and is rejected on a free one, which is a bad thing to discover
  // at deploy time.
  t.ok(/new_sqlite_classes\s*=\s*\[\s*"Room"\s*\]/.test(TOML),
    'the migration asks for the SQLite backend, which is the one on the free plan');
  t.ok(!/new_classes\s*=/.test(TOML), 'and not the key-value one, which is not');
  t.ok(/class_name\s*=\s*"Room"/.test(TOML) && /name\s*=\s*"ROOM"/.test(TOML),
    'the binding name matches what the worker reads from env');
  t.ok(SRC.includes('env.ROOM.idFromName'), 'and the worker really does use that binding');
  t.ok(/main\s*=\s*"worker.js"/.test(TOML), 'wrangler points at the worker file that exists');

  // Hibernation only works if the socket state lives on the socket. An
  // instance field would survive the tests and die in production.
  t.ok(SRC.includes('acceptWebSocket') && SRC.includes('serializeAttachment'),
    'sockets are accepted for hibernation and carry their own side');
  t.ok(!/this\.side\s*=/.test(SRC),
    'and no per-socket state is kept on the object, which does not survive eviction');
}

t.done();
