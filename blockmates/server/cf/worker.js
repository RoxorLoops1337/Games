// Blockmates on Cloudflare: one Worker in front of one Durable Object that runs the same World as the Node server.
// Deploy by hand (never by the Pages build): see README.md in this folder.
import { World } from '../world.js';
import { TICK } from '../../shared/data.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

export class WorldDO {
  constructor(state, env) {
    this.state = state; this.env = env; this.world = null; this.timer = null; this.idle = 0; this.sinceSave = 0;
    state.blockConcurrencyWhile(() => this.load());
  }
  async load() {
    const env = this.env;
    const w = new World({
      name: env.WORLD_NAME || 'Blockmates World', seed: Number(env.SEED || 1337), password: env.PASSWORD || '',
      ops: String(env.OPS || '').split(',').map((s) => s.trim()).filter(Boolean), maxPlayers: 16,
      motd: env.MOTD || undefined,
    });
    const st = await this.state.storage.get('state');
    if (st) w.importState(st);
    const chunks = await this.state.storage.list({ prefix: 'c:' });
    for (const [k, v] of chunks) w.importChunk(Number(k.slice(2)), v);
    this.world = w;
  }
  async save() {
    const w = this.world;
    const dirty = w.exportDirtyChunks();
    const keys = Object.keys(dirty);
    for (let i = 0; i < keys.length; i += 100) {
      const batch = {};
      for (const k of keys.slice(i, i + 100)) batch['c:' + k] = dirty[k];
      await this.state.storage.put(batch);
    }
    if (w.dirtyState || keys.length) { await this.state.storage.put('state', w.exportState()); w.dirtyState = false; }
  }
  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const w = this.world;
      try { w.tick(); } catch (e) { console.error('tick', e); }
      if (w.players.size === 0) {
        if (++this.idle > TICK * 5) { clearInterval(this.timer); this.timer = null; this.idle = 0; this.save(); }
      } else this.idle = 0;
      if (++this.sinceSave >= TICK * 20) { this.sinceSave = 0; this.save(); }
    }, 1000 / TICK);
  }
  async fetch(req) {
    const url = new URL(req.url);
    const w = this.world;
    if (url.pathname === '/status') {
      return new Response(JSON.stringify({ name: w.name, players: w.players.size, max: w.maxPlayers, day: w.day, password: !!w.password, motd: w.motd }), { headers: { 'content-type': 'application/json', ...CORS } });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const send = (o) => { try { server.send(JSON.stringify(o)); } catch { /* socket closing */ } };
    send.close = () => { try { server.close(1000, 'bye'); } catch { /* closed */ } };
    const id = w.connect(send);
    server.addEventListener('message', (e) => { try { w.message(id, JSON.parse(e.data)); } catch { /* ignore garbage */ } });
    const bye = () => { try { w.disconnect(id); } catch { /* already gone */ } if (w.players.size === 0) this.save(); };
    server.addEventListener('close', bye); server.addEventListener('error', bye);
    this.ensureTimer();
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const stub = env.WORLD.get(env.WORLD.idFromName(env.WORLD_ID || 'main'));
    if (url.pathname === '/ws' || url.pathname === '/status') return stub.fetch(req);
    const page = env.GAME_URL || 'https://games-71g.pages.dev/blockmates/';
    return Response.redirect(`${page}?server=${encodeURIComponent(url.host)}`, 302);
  },
};
