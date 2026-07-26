// Ironbridge relay — a Durable Object that holds two WebSockets and copies
// bytes between them.
//
// It does not know what a command is, what a turn is, or who is winning. It
// hands each player a seat number and a shared seed and then gets out of the
// way; both browsers run the entire simulation from those two facts plus each
// other's orders. That ignorance is the design, not an omission. The moment
// this file learns what a command means, the game's rules exist in two places
// and they will disagree.
//
// Deploy:  npx wrangler deploy      (see README.md)

const CODE_LEN = 4;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I and no O — they get misread aloud
const MAX_MSG = 8192;                          // an orders message is a few hundred bytes
const SEATS = 2;

// Exported so the tests can drive it with a known source of randomness.
export function makeCode(rand){
  const r = rand || (() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += ALPHABET[Math.floor(r() * ALPHABET.length) % ALPHABET.length];
  return out;
}

const json = (o, status) => new Response(JSON.stringify(o), {
  status: status || 200,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
});

export class Room {
  constructor(state, env){
    this.state = state;
    this.env = env;
  }

  // The seed both players build their match from. Written once, on the first
  // join, and read by everyone after — including a socket that reconnects, so
  // the answer never changes under a live match.
  async seed(){
    let s = await this.state.storage.get('seed');
    if (typeof s !== 'number'){
      s = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
      await this.state.storage.put('seed', s);
    }
    return s;
  }

  live(){
    return this.state.getWebSockets().filter(ws => ws.readyState === undefined || ws.readyState === 1);
  }

  seatOf(ws){
    try { const a = ws.deserializeAttachment(); return a && typeof a.seat === 'number' ? a.seat : -1; }
    catch (e){ return -1; }
  }

  send(ws, obj){ try { ws.send(JSON.stringify(obj)); } catch (e){} }

  async fetch(req){
    const url = new URL(req.url);
    const code = url.searchParams.get('code') || '';

    // A plain GET is the host asking whether this code is free before it reads
    // the letters out to anybody.
    if (req.headers.get('Upgrade') !== 'websocket'){
      return json({ free: this.live().length === 0, players: this.live().length });
    }

    const taken = new Set(this.live().map(ws => this.seatOf(ws)));
    if (taken.size >= SEATS || this.live().length >= SEATS){
      // Accept just far enough to say why, then close. An outright HTTP error
      // reaches the browser as a bare "connection failed" with no reason in it.
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({ t:'full' }));
      try { pair[1].close(4001, 'full'); } catch (e){}
      return new Response(null, { status:101, webSocket: pair[0] });
    }

    const seat = taken.has(0) ? 1 : 0;
    const seed = await this.seed();
    const pair = new WebSocketPair();
    const server = pair[1];
    // Hibernation: the room costs nothing while nobody is typing, and the
    // seat number survives being evicted from memory.
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ seat });
    this.send(server, { t:'seat', me:seat, seed, code });

    // Both seats filled — tell both to start. They will build the same match
    // from the same seed without another byte from here.
    const now = this.live();
    if (now.length >= SEATS) for (const ws of now) this.send(ws, { t:'go' });

    return new Response(null, { status:101, webSocket: pair[0] });
  }

  // The whole job. Whatever one player said, the other one hears, unread.
  webSocketMessage(ws, msg){
    if (typeof msg !== 'string') return;         // orders are JSON text
    if (msg.length > MAX_MSG) return;            // nothing legitimate is this big
    const from = this.seatOf(ws);
    for (const other of this.live()){
      if (other === ws) continue;
      if (this.seatOf(other) === from && from !== -1) continue;
      try { other.send(msg); } catch (e){}
    }
  }

  webSocketClose(ws){ this.gone(ws); }
  webSocketError(ws){ this.gone(ws); }

  gone(ws){
    for (const other of this.live()){
      if (other === ws) continue;
      this.send(other, { t:'bye' });
    }
  }
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { headers:{
      'access-control-allow-origin':'*', 'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type',
    } });

    if (url.pathname === '/new' && req.method === 'POST'){
      // Four letters out of 331,776. With ten people and a couple of matches a
      // day a collision is not a real risk, but an occupied room would be a
      // confusing way to find that out, so ask before handing the code over.
      for (let i = 0; i < 5; i++){
        const code = makeCode();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await room.fetch(new Request('https://relay/room?code=' + code));
        const st = await r.json();
        if (st.free) return json({ code });
      }
      return json({ error:'no free room code' }, 503);
    }

    const m = url.pathname.match(/^\/room\/([A-Za-z]{1,8})$/);
    if (m){
      const code = m[1].toUpperCase();
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      return room.fetch(new Request('https://relay/room?code=' + code, req));
    }

    if (url.pathname === '/' || url.pathname === '/health')
      return json({ ok:true, service:'ironbridge-relay' });

    return new Response('not found', { status:404 });
  },
};
