/* =====================================================================
   Ironbridge relay — a Cloudflare Worker with one Durable Object per room.
   =====================================================================
   This relay does not know what Ironbridge is. It holds two WebSockets, gives
   them a shared seed and a side each, and copies every message from one to the
   other. It never parses a command, never simulates anything, and never learns
   the state of a match — the two browsers do all of that, from the seed plus
   each other's inputs.

   That is the whole reason this is free. The traffic is a few dozen bytes per
   player action rather than a stream of positions, and an empty room costs
   nothing at all because hibernation lets the object be evicted between
   messages and rebuilt from storage when one arrives.

   The one thing it IS authoritative about is the seed and the side assignment,
   because those two have to be agreed before either machine simulates a tick,
   and two browsers cannot agree on a coin flip by themselves.
   ===================================================================== */

// Four letters, from an alphabet with no O/0, I/1, or similar. A code gets read
// aloud down a phone or typed from a photo, so the characters that get
// misheard or mistyped are simply not in it.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;

function makeCode(){
  const b = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

// A code the player typed. Upper-cased and stripped of anything not in the
// alphabet, so "abcd", "AB-CD" and " abcd " all reach the same room.
function cleanCode(raw){
  const s = String(raw || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const c of s) if (!ALPHABET.includes(c)) return null;
  return s;
}

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type':'application/json', 'access-control-allow-origin':'*' },
});

export default {
  async fetch(request, env){
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: {
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type',
    } });

    // POST /new -> mint a room code. The code IS the Durable Object name, so
    // there is no directory to keep and nothing to clean up: a room that is
    // never joined simply never gets instantiated.
    if (url.pathname === '/new' && request.method === 'POST')
      return json({ code: makeCode() });

    // GET /room/<CODE> -> the WebSocket. Both players hit the same URL; the
    // room decides which of them is side 0 and which is side 1.
    //
    // ?have=1&tick=N is the client TELLING the room whether it still has a
    // board. The room used to guess this from a sticky `started` flag, which
    // is the one thing it cannot observe and got wrong in both directions —
    // see the note above `decide()`.
    const m = url.pathname.match(/^\/room\/([A-Za-z]+)$/);
    if (m){
      const code = cleanCode(m[1]);
      if (!code) return json({ error:'bad code' }, 400);
      if (request.headers.get('Upgrade') !== 'websocket')
        return json({ error:'expected a websocket' }, 426);
      const id = env.ROOM.idFromName(code);
      return env.ROOM.get(id).fetch(request);
    }

    return json({ error:'not found' }, 404);
  },
};

export class Room {
  constructor(state, env){
    this.state = state;
    this.env = env;
  }

  // Everything the room knows, kept in storage rather than memory so a
  // hibernated object wakes up with the same seed and the same side
  // assignments. Memory does not survive eviction; storage does.
  async meta(){
    if (!this._meta){
      this._meta = (await this.state.storage.get('meta')) || {
        // One seed for the match, chosen here because the two browsers cannot
        // agree on one between themselves. 31 bits: the game reseeds with
        // (s >>> 0) || 1, so anything non-zero and unsigned is fine.
        seed: (crypto.getRandomValues(new Uint32Array(1))[0] >>> 1) || 1,
        taken: [false, false],
        started: false,
      };
    }
    return this._meta;
  }

  async save(){ await this.state.storage.put('meta', this._meta); }

  // A socket the runtime still lists but that is on its way out. `webSocketClose`
  // is not guaranteed to have run yet — a browser tab that was killed, a phone
  // that went through a tunnel — and a socket in that state used to keep its
  // seat, so the player coming back was told the room was full and the room
  // they were locked out of was their own.
  dead(ws){
    if (ws.readyState !== undefined && ws.readyState > 1) return true;   // CLOSING/CLOSED
    return false;
  }

  // Free the seat of anything that is not really here any more, and hand back
  // the sockets that are.
  async reap(){
    const out = [];
    const meta = await this.meta();
    let freed = false;
    for (const ws of this.state.getWebSockets()){
      if (!this.dead(ws)){ out.push(ws); continue; }
      const a = ws.deserializeAttachment() || {};
      if (a.side === 0 || a.side === 1){ meta.taken[a.side] = false; freed = true; }
      try { ws.close(1001, 'stale'); } catch (e) { /* already gone */ }
    }
    if (freed) await this.save();
    return out;
  }

  async fetch(request){
    const meta = await this.meta();
    const live = await this.reap();

    // Two players to a room. A third gets a clear refusal rather than a socket
    // that silently never receives anything.
    if (live.length >= 2)
      return new Response(JSON.stringify({ error:'room full' }), { status:409 });

    // What this client says it is bringing. A player who still has a board is
    // the only one who can hand it over, and this is the ONE fact the room
    // cannot work out for itself.
    const q = new URL(request.url).searchParams;
    const have = q.get('have') === '1';
    const tick = Math.max(0, parseInt(q.get('tick'), 10) || 0);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // The side this socket gets. Sides are claimed rather than counted, so a
    // player who drops and rejoins gets their OWN side back instead of being
    // handed whichever is free — reconnecting as the other player would hand
    // them their opponent's hold.
    const side = meta.taken[0] ? (meta.taken[1] ? -1 : 1) : 0;
    if (side < 0) return new Response(JSON.stringify({ error:'room full' }), { status:409 });
    meta.taken[side] = true;
    await this.save();

    // Hibernation: the runtime may evict this object between messages and
    // rebuild it later. Attachments survive that; instance fields do not, so
    // the side is stored ON the socket.
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ side, have, tick });

    server.send(JSON.stringify({ k:'hello', side, seed:meta.seed, code:null }));
    await this.announce(server);

    return new Response(null, { status:101, webSocket:client });
  }

  // Tell everyone how many are here, and once both are, decide what "both are
  // here" MEANS — a new match, or two people getting back into an old one.
  async announce(){
    const socks = await this.reap();
    const n = socks.length;
    for (const ws of socks){
      const a = ws.deserializeAttachment() || {};
      this.tell(ws, { k:'peers', n, side:a.side });
    }
    if (n === 2) await this.decide(socks);
  }

  /* --------------------------------------------------------------- decide
     This used to be one sticky boolean. `meta.started` was set the first time
     a room reached two players and never cleared, and the room read it as
     "somebody in here has a board." Those are not the same thing, and the gap
     between them was two hangs:

       - Both players reload. The room has `started:true`, so it sends `rejoin`
         instead of `start`, and labels one of them "staying" — the one that
         happened to connect first. That player does not have a board either.
         It waits for a snapshot; the other waits for a snapshot; neither ever
         sends one. Both sit under "picking the match up where it was" forever.

       - A room that has ever started can NEVER start again. Two fresh players
         on that code get `rejoin` and nothing else, whatever they do.

     The room could not observe the missing fact, so it guessed. It does not
     have to guess: the client knows perfectly well whether it has a board and
     can simply say so on connect. That is what `?have=1&tick=N` is. The room
     collects the claims and rules.

     The comment this replaces said "from inside a browser 'I have a match and
     you do not' is exactly the thing a returning player cannot tell." True —
     and irrelevant. The RETURNING player cannot tell. The one that stayed can,
     and it is the only one that needs to.                                    */
  async decide(socks){
    const meta = await this.meta();
    const claim = socks.map(ws => ({ ws, a: ws.deserializeAttachment() || {} }));
    const holders = claim.filter(c => c.a.have);

    if (!holders.length){
      // Nobody is carrying a match, so this is a start — whether or not this
      // room has ever started one before. A new seed, because a code being
      // reused is a NEW match and replaying the old one's seed would make two
      // different matches indistinguishable in a bug report.
      if (meta.started) meta.seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 1) || 1;
      meta.started = true;
      await this.save();
      for (const c of claim) this.tell(c.ws, { k:'start', seed:meta.seed, side:c.a.side });
      return;
    }

    // Somebody has a board, so nobody gets `start` — it would put the player
    // who never left back on the first tick. The keeper hands its board over.
    // Furthest ahead wins rather than lowest seat: whichever machine has
    // simulated more is the more authoritative one, and on the ordinary
    // one-dropped-one-stayed case there is only one candidate anyway.
    const keeper = holders.reduce((a, b) => ((b.a.tick | 0) > (a.a.tick | 0) ? b : a));
    meta.started = true;
    await this.save();
    for (const c of claim)
      this.tell(c.ws, { k:'rejoin', seed:meta.seed, side:c.a.side,
        role: c === keeper ? 'staying' : 'returning' });
  }

  tell(ws, obj){
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* a closing socket is not an error worth failing on */ }
  }

  // The hot path. Everything that is not a control message is copied verbatim
  // to the other socket without being parsed — the relay has no opinion about
  // command contents, and adding one would be a second place for the rules to
  // live and disagree with the game.
  // `"have:<tick>"` — a client saying it is holding a board, and how far along
  // it is. The connect-time claim in the URL is only true of the machine that
  // is connecting; the one that has been sitting here all match declared
  // itself BEFORE the match existed, and an attachment written once at connect
  // would still say it had nothing. So the claim is refreshed on the wire.
  //
  // Deliberately a bare string rather than a command, so the hot path stays a
  // prefix compare and this relay still never parses a single thing the game
  // says to itself. `"ping"` has worked that way since the first version.
  static HAVE = '"have:';

  async webSocketMessage(ws, raw){
    if (typeof raw !== 'string') return;
    if (raw.length > 16384) return;                 // nothing legitimate is this big
    if (raw.startsWith(Room.HAVE)){
      const tick = parseInt(raw.slice(Room.HAVE.length), 10);
      const a = ws.deserializeAttachment() || {};
      ws.serializeAttachment({ ...a, have:true, tick: tick > 0 ? tick : 0 });
      this.tell(ws, { k:'pong' });
      return;                                       // housekeeping, not a move
    }
    for (const other of this.state.getWebSockets()){
      if (other === ws) continue;
      try { other.send(raw); } catch (e) { /* ignore */ }
    }
    // A one-byte liveness reply, so a client can tell "my peer is thinking"
    // from "my connection is gone" without a second channel.
    if (raw === '"ping"') this.tell(ws, { k:'pong' });
  }

  async webSocketClose(ws){
    const a = ws.deserializeAttachment() || {};
    const meta = await this.meta();
    // Free the side so the same player can come back to it. The match keeps
    // its seed, so a rejoin resumes the same match rather than starting a new
    // one under the same code.
    if (a.side === 0 || a.side === 1){ meta.taken[a.side] = false; await this.save(); }
    for (const other of this.state.getWebSockets()){
      if (other === ws) continue;
      this.tell(other, { k:'peerGone', side:a.side });
    }
  }

  async webSocketError(ws){ await this.webSocketClose(ws); }
}
