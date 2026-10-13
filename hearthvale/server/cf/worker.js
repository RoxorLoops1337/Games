// Hearthvale on Cloudflare: a Worker in front of ONE Durable Object that is the always-on valley.
// Same Host (shared/host.js) as the Node server; only the plumbing differs. Deploy by hand, see README.md.
//   GET /          -> redirects to the game page, pointed at this server
//   GET /health    -> { ok, online, players }
//   GET /ws        -> a player's WebSocket
import { DurableObject } from 'cloudflare:workers';
import * as S from '../../shared/sim.js';
import { Host, TICK_MS } from '../../shared/host.js';

const CHUNK = 100 * 1024, SAVE_MS = 30000;

export class Valley extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.env = env; this.host = null; this.timer = null; this.lastSave = 0;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      let world = null;
      try {
        const n = await ctx.storage.get('chunks');
        if (n) { const parts = []; for (let i = 0; i < n; i++) parts.push(await ctx.storage.get('w' + i)); world = S.deserialize(parts.join('')); }
      } catch (e) { console.error('load failed, starting fresh', e && e.message); }
      this.host = new Host({ world, seed: 1 });
    });
  }
  async save() {
    const str = this.host.serialize(); const n = Math.ceil(str.length / CHUNK); const put = { chunks: n };
    for (let i = 0; i < n; i++) put['w' + i] = str.slice(i * CHUNK, (i + 1) * CHUNK);
    await this.ctx.storage.put(put); this.lastSave = Date.now();
  }
  async fetch(req) {
    await this.ready; const url = new URL(req.url);
    if (url.pathname === '/health') return Response.json({ ok: true, online: this.host.online, players: Object.keys(this.host.W.players).length, t: Math.round(this.host.W.t) }, { headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname !== '/ws' || req.headers.get('Upgrade') !== 'websocket') return new Response('Hearthvale valley', { status: 426 });
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair); server.accept();
    this.host.last = Date.now();
    const peer = { send: (s) => server.send(s), close: (c) => { try { server.close(c === 4000 ? 4000 : 1000, 'bye'); } catch {} }, backlog: 0 };
    const conn = this.host.attach(peer);
    server.addEventListener('message', (e) => conn.message(typeof e.data === 'string' ? e.data : ''));
    const gone = () => { conn.close(); if (!this.host.online) this.stop(); };
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    this.start();
    return new Response(null, { status: 101, webSocket: client });
  }
  start() {
    if (this.timer) return;
    this.host.catchUp(Date.now() - this.host.last);
    this.timer = setInterval(() => { this.host.step(); if (Date.now() - this.lastSave > SAVE_MS) this.save().catch(() => {}); }, TICK_MS);
  }
  async stop() { clearInterval(this.timer); this.timer = null; this.host.last = Date.now(); await this.save().catch(() => {}); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' && env.GAME_URL) return Response.redirect(env.GAME_URL + '?server=wss://' + url.host + '/ws&auto', 302);
    if (url.pathname === '/health' || url.pathname === '/ws') return env.VALLEY.get(env.VALLEY.idFromName(env.VALLEY_NAME || 'main')).fetch(req);
    return new Response('Not found', { status: 404 });
  },
};
