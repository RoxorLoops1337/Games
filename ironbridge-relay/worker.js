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

  async fetch(request){
    const meta = await this.meta();
    const live = this.state.getWebSockets();

    // Two players to a room. A third gets a clear refusal rather than a socket
    // that silently never receives anything.
    if (live.length >= 2)
      return new Response(JSON.stringify({ error:'room full' }), { status:409 });

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
    server.serializeAttachment({ side });

    server.send(JSON.stringify({ k:'hello', side, seed:meta.seed, code:null }));
    await this.announce();

    return new Response(null, { status:101, webSocket:client });
  }

  // Tell everyone how many are here, and start the match the moment both are.
  // The start message carries the seed again so a client that missed `hello`
  // (or reconnected) still has it.
  async announce(){
    const meta = await this.meta();
    const socks = this.state.getWebSockets();
    const n = socks.length;
    for (const ws of socks){
      const a = ws.deserializeAttachment() || {};
      this.tell(ws, { k:'peers', n, side:a.side });
    }
    if (n === 2 && !meta.started){
      meta.started = true;
      await this.save();
      for (const ws of socks){
        const a = ws.deserializeAttachment() || {};
        this.tell(ws, { k:'start', seed:meta.seed, side:a.side });
      }
    }
  }

  tell(ws, obj){
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* a closing socket is not an error worth failing on */ }
  }

  // The hot path. Everything that is not a control message is copied verbatim
  // to the other socket without being parsed — the relay has no opinion about
  // command contents, and adding one would be a second place for the rules to
  // live and disagree with the game.
  async webSocketMessage(ws, raw){
    if (typeof raw !== 'string') return;
    if (raw.length > 16384) return;                 // nothing legitimate is this big
    const me = (ws.deserializeAttachment() || {}).side;
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
