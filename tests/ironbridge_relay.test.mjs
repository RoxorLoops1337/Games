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
  // The real thing has this and the stand-in did not, so a worker that closed a
  // socket was throwing into a catch and the test read the miss as the worker
  // declining to act. A stub missing a method the code under test calls is not
  // a smaller stub, it is a silently different one.
  close(){ this.closed = true; this.readyState = 3; }
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
// A client says on connect whether it is bringing a board. The room cannot see
// this and used to guess at it; `have` is that claim.
const joinRoom = (room, have, tick) => room.fetch(new Request(
  'https://x/room/ABCD' + (have ? '?have=1&tick=' + (tick || 0) : '?have=0'),
  { headers:{ Upgrade:'websocket' } }));
// ...and keeps it current on the wire, because the machine that stayed made
// its claim before the match existed.
const beats = (room, ws, tick) => room.webSocketMessage(ws, '"have:' + tick + '"');

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

/* ---------------------------------------------- a flood cannot drain the wallet
   Inbound WebSocket messages bill 20:1, and the relay authenticates nothing, so
   one socket in a tight send loop would burn the day's free allowance in
   seconds and take multiplayer down for everyone. A per-connection rate cap is
   the only backstop. A fast-but-legitimate client sends about thirty a second;
   the cap is well above that and only a flood reaches it. */
{
  const st = mkState();
  const room = new Room(st, {});
  await joinRoom(room); await joinRoom(room);
  const [a, b] = st.__socks;
  const cap = Room.MSG_PER_SEC;
  t.ok(cap >= 120, 'the cap leaves generous headroom over a fast client (' + cap + '/s)');
  const cmd = JSON.stringify({ k:'cmd', tick:1, side:0, cmds:[] });
  const before = b.sent.length;
  // Everything in this block runs inside one real-time second, so it all falls
  // in the same window.
  for (let i = 0; i < cap + 60; i++) await room.webSocketMessage(a, cmd);
  const relayed = b.sent.length - before;
  t.ok(relayed === cap,
    'a flood is relayed up to the cap and no further (' + relayed + ' of ' + (cap + 60) + ' reached the peer)');
}

/* --------------------------------------------- leaving, and coming back */
{
  const st = mkState();
  const room = new Room(st, {});
  await joinRoom(room); await joinRoom(room);
  const [a, b] = st.__socks;
  const seed = a.last('start').seed;

  // The match runs. Both machines beat their claim out on the wire once a
  // second, which is what makes the one that STAYS a candidate to hand the
  // board over — its connect-time claim was made before there was a match.
  await beats(room, a, 400); await beats(room, b, 400);

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

  // `start` must NOT be sent again. It would put the player who never left back
  // on the first tick and throw away the match they are still holding. Instead
  // the room says a rejoin happened, and says which of the two is which —
  // because from inside a browser "I have a match and you do not" is exactly
  // the thing a returning player cannot work out for itself.
  t.ok(!a2.last('start'), 'a returning player is NOT told to start');
  t.ok(b.msgs().filter(m => m.k === 'start').length === 1,
    'and the player who stayed is told to start exactly once, ever');
  const rIn = a2.last('rejoin'), rStay = b.last('rejoin');
  t.ok(!!rIn && !!rStay, 'both are told a rejoin happened instead');
  t.ok(rIn.role === 'returning', 'the one that just arrived is the returning one (' + (rIn && rIn.role) + ')');
  t.ok(rStay.role === 'staying', 'and the one already there is the one that stayed (' + (rStay && rStay.role) + ')');
  t.ok(rIn.seed === seed && rStay.seed === seed, 'both on the original seed');
  t.ok(rIn.side === 0 && rStay.side === 1, 'each keeping its own side');

  // A room filling up for the FIRST time must still be a start, not a rejoin.
  {
    const fresh = new Room(mkState(), {});
    await joinRoom(fresh); await joinRoom(fresh);
    const socks = fresh.state.getWebSockets();
    t.ok(socks.every(w => !!w.last('start')), 'a room filling up the first time still starts');
    t.ok(socks.every(w => !w.last('rejoin')), 'and says nothing about rejoining');
  }

  /* ------------------------------------------------- both of them reloaded
     The hang. The room used to decide start-versus-rejoin from a sticky flag
     it set the first time two players were present and never cleared — which
     is not the same fact as "somebody in here still has a board". So when
     BOTH players reloaded, the room sent `rejoin` and named one of them the
     keeper on the strength of having connected first. That machine had
     nothing either. It waited for a snapshot; the other waited for a
     snapshot; neither ever sent one, and both sat under a banner saying the
     match was being picked up. Forever.

     Nobody claims a board now, so nobody is asked for one.                  */
  {
    const st2 = mkState();
    const room2 = new Room(st2, {});
    await joinRoom(room2); await joinRoom(room2);        // a match gets played
    const [p, q] = st2.__socks;
    const oldSeed = p.last('start').seed;
    await beats(room2, p, 900); await beats(room2, q, 900);
    p.closed = true; q.closed = true;
    await room2.webSocketClose(p); await room2.webSocketClose(q);

    // Both come back with nothing, which is what a reloaded tab is.
    await joinRoom(room2); await joinRoom(room2);
    const back = st2.__socks.filter(w => !w.closed);
    t.ok(back.length === 2, 'both of them get back into the room (' + back.length + ')');
    t.ok(back.every(w => !!w.last('start')),
      'and with neither of them holding a board, the room starts a new match rather than asking them to swap one');
    t.ok(back.every(w => !w.last('rejoin')), 'nobody is told to rejoin a match that no longer exists anywhere');
    t.ok(back[0].last('start').seed === back[1].last('start').seed, 'both on the same seed');
    t.ok(back[0].last('start').seed !== oldSeed,
      'and a NEW one — a code being reused is a new match, and replaying the old seed would make two different matches read identically in a bug report');
    t.ok(back[0].last('start').side !== back[1].last('start').side, 'one seat each');
  }

  /* --------------------------------------------- a claim that is out of date
     The other half of the same bug, and the reason the claim is beaten out on
     the wire rather than read once at connect. The player who STAYS made its
     claim before the match existed — at that moment it truthfully had
     nothing. Read only at connect, it would still be saying so an hour later,
     and a returning player would be told to start instead of being handed the
     board that is right there.                                              */
  {
    const st3 = mkState();
    const room3 = new Room(st3, {});
    await joinRoom(room3); await joinRoom(room3);       // neither has anything YET
    const [h, j] = st3.__socks;
    const seed3 = h.last('start').seed;
    await beats(room3, h, 250); await beats(room3, j, 250);   // now they do

    j.closed = true; await room3.webSocketClose(j);
    await joinRoom(room3);                                     // back with nothing
    const back = st3.__socks[st3.__socks.length - 1];
    t.ok(!back.last('start'), 'a returning player is not told to start a new match over a live one');
    const rr = back.last('rejoin'), rs = h.last('rejoin');
    t.ok(!!rr && !!rs, 'both are told it is a rejoin');
    t.ok(rs.role === 'staying',
      'and the one that has been beating out a claim all match is the one asked for the board');
    t.ok(rr.role === 'returning' && rr.seed === seed3, 'on the same seed, so it is the same match');
  }

  // Two boards, which happens when both links blink at once. The furthest
  // along is the better board to keep — it is the one with the most of the
  // match actually simulated in it.
  {
    const st4 = mkState();
    const room4 = new Room(st4, {});
    await joinRoom(room4, true, 120); await joinRoom(room4, true, 6100);
    const [lo, hi] = st4.__socks;
    t.ok(hi.last('rejoin') && hi.last('rejoin').role === 'staying',
      'with a board each, the machine further into the match keeps it (' +
      (hi.last('rejoin') || {}).role + ')');
    t.ok(lo.last('rejoin') && lo.last('rejoin').role === 'returning',
      'and the one further behind takes the other one');
    t.ok(!lo.last('start') && !hi.last('start'), 'and neither is told to start over');
  }

  // A seat held by a socket that is already gone. `webSocketClose` is not
  // guaranteed to have run — a killed tab, a phone through a tunnel — and a
  // dead socket used to keep its seat, so the player coming back was told the
  // room was full. The room they were locked out of was their own.
  {
    const st5 = mkState();
    const room5 = new Room(st5, {});
    await joinRoom(room5); await joinRoom(room5);
    const [x, y] = st5.__socks;
    x.readyState = 3;                                   // CLOSED, and nobody was told
    const r = await joinRoom(room5);
    t.ok(r.status === 101,
      'a seat held by a socket that is already closed does not lock its owner out (' + r.status + ')');
    const back = st5.__socks[st5.__socks.length - 1];
    t.ok(back.last('hello').side === 0, 'and the seat it hands back is the dead one’s, not the live one’s');
    t.ok(y.readyState !== 3, 'the socket that is actually alive is left alone');
  }

  /* ------------------------------------------- the seat that never came free
     From a real report, with the log to prove it. A player dropped seven
     minutes into a match and could not get back in. On the machine that
     stayed:

       t 6258 .. 6815   stalled, waiting on the other player   (18 seconds)
       t 6826           PEER GONE — the relay says their socket closed
       t 6826           PEER GONE  (x4 more, over the next two minutes)

     and not one `rejoin` line anywhere. The player who stayed was never told
     anybody arrived, because nobody ever did.

     TWO THINGS held that seat, and they are the same thing twice.

     A dead socket is still an OPEN socket: nothing tells a server the machine
     at the other end has gone until a TCP timeout expires, which that log times
     at twenty-three seconds — the peer stopped sending at 228.6s and the close
     did not land until 252.1s. And the seat itself was RECORDED rather than
     observed, in a flag cleared by an event that is not guaranteed to run at
     all, so a close that never fires locks a room forever. The room is named by
     its code, so the code is dead forever, and the only thing anybody sees is
     "room full" for a room with one player in it.                           */
  {
    const st7 = mkState();
    const room7 = new Room(st7, {});
    await joinRoom(room7); await joinRoom(room7);
    const [host, gone] = st7.__socks;
    await beats(room7, host, 6200); await beats(room7, gone, 6200);
    // Their machine vanishes. No close event, no readyState change — the socket
    // is OPEN and will stay OPEN until a timeout nobody can wait for. This is
    // the state the report was taken in.
    room7._seen[1] = Date.now() - 30000;
    const before = host.msgs().filter(m => m.k === 'peerGone').length;

    const blind = await joinRoom(room7);        // no claim: an actual third player
    t.ok(blind.status === 409,
      'somebody with no claim on a seat is still refused while two are held (' + blind.status + ')');

    const back = await room7.fetch(new Request('https://x/room/ABCD?have=0&side=1',
      { headers:{ Upgrade:'websocket' } }));
    t.ok(back.status === 101,
      'but the player whose seat it is gets back in, over a socket that has stopped answering (' +
      back.status + ')');
    const b2 = st7.__socks[st7.__socks.length - 1];
    t.ok(b2.last('hello').side === 1, 'and gets their OWN seat, not their opponent’s hold');
    t.ok(gone.closed === true || gone.readyState === 3,
      'the socket that had stopped answering is closed rather than left holding it');
    t.ok(!!b2.last('rejoin') && !!host.last('rejoin'),
      'both machines are told this is a rejoin rather than a fresh start');
    t.ok(host.last('rejoin').role === 'staying' && b2.last('rejoin').role === 'returning',
      'with the one that never left named as the keeper of the board');
    // The eviction must not read as a departure. "They are gone" arriving a
    // beat after "they are back" is a race that looks exactly like the rejoin
    // having failed, which is the thing being fixed.
    await room7.webSocketClose(gone);
    t.ok(host.msgs().filter(m => m.k === 'peerGone').length === before,
      'and the replaced socket closing does NOT tell the other machine its peer left');
  }

  // The other side of that rule: a seat that is answering is not up for grabs.
  // A player who is really playing publishes a batch every tick, so silence is
  // the only thing this can ever take a seat from.
  {
    const st8 = mkState();
    const room8 = new Room(st8, {});
    await joinRoom(room8); await joinRoom(room8);
    const [, live] = st8.__socks;
    await beats(room8, live, 4000);                    // heard from just now
    const r = await room8.fetch(new Request('https://x/room/ABCD?have=0&side=1',
      { headers:{ Upgrade:'websocket' } }));
    t.ok(r.status === 409,
      'a second tab claiming a seat somebody is actively playing is refused (' + r.status + ')');
    t.ok(!live.closed, 'and the player in it is left alone');
    t.ok(Room.STALE_MS >= 5000 && Room.STALE_MS <= 60000,
      'the silence a seat has to keep before it can be taken is longer than any hitch and ' +
      'shorter than any patience (' + Room.STALE_MS + 'ms)');
  }

  // Occupancy is DERIVED, every time it is asked. The bug above was a stored
  // copy of a fact the room can read off its own sockets, defended against a
  // reality it disagreed with — the same shape as the `started` flag two blocks
  // up. There is no copy to disagree now, and there must not be one again.
  {
    const st9 = mkState();
    const room9 = new Room(st9, {});
    await joinRoom(room9); await joinRoom(room9);
    const stored = st9.__store.get('meta') || {};
    t.ok(stored.taken === undefined,
      'the room stores no record of who is sitting where');
    t.ok(typeof room9.seats === 'function' && room9.seats(st9.__socks).every(w => !!w),
      'it reads the seats off the live sockets instead');
    t.ok(!/meta\.taken/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')),
      'and nothing outside the comments explaining why touches a stored seat again');
    // Rebuilt after eviction, with no sockets: both seats read as free, which
    // is the right answer rather than a lost one — an object that was evicted
    // has heard nothing recently by definition.
    const cold9 = new Room({ ...st9, getWebSockets:() => [] }, {});
    t.ok(cold9.seatFor([], -1).side === 0 && cold9.seatFor([], 1).side === 1,
      'a rebuilt room hands out seats rather than defending ones nobody is in');
  }

  // The claim beat is housekeeping, not a move. Relaying it would be harmless
  // — the game ignores a bare string — but the relay's one rule is that it
  // carries the game's words and speaks none of its own.
  {
    const st6 = mkState();
    const room6 = new Room(st6, {});
    await joinRoom(room6); await joinRoom(room6);
    const [u, v] = st6.__socks;
    const before = v.sent.length;
    await beats(room6, u, 77);
    t.ok(v.sent.length === before, 'a claim beat is not relayed to the other player');
    t.ok(!!u.last('pong'), 'it is answered, so it doubles as the liveness ping');
    t.ok((u.deserializeAttachment() || {}).tick === 77,
      'and it is what updates the claim the room rules on (' + (u.deserializeAttachment() || {}).tick + ')');
  }

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
