// Platform-neutral Hearthvale host: owns the world, the connections and the tick loop's body.
// The Node server and the Cloudflare Durable Object both wrap their sockets as "peers"
// ({ send(str), close(code), backlog? }) and drive step() on a timer.
import * as S from './sim.js';

export const TICK_MS = 100, SNAP_EVERY = 2, MAX_CATCHUP_S = 900;
const sha = async (s) => {
  const b = new TextEncoder().encode(s);
  const h = await (globalThis.crypto || (await import('node:crypto')).webcrypto).subtle.digest('SHA-256', b);
  return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, '0')).join('');
};

export class Host {
  constructor({ world = null, seed = 1, now = () => Date.now() } = {}) {
    this.now = now; this.conns = new Set(); this.tickN = 0; this.dirty = false;
    this.W = world || S.createWorld(seed); this.last = now(); S.setNow(this.W, this.last);
    if (world && world.savedAt) this.catchUp(now() - world.savedAt);
  }
  get online() { return this.conns.size; }
  // after a sleep (Durable Object woke up, server restarted) let the world catch up, never more than MAX_CATCHUP_S
  catchUp(sleptMs) { let left = Math.min(MAX_CATCHUP_S, Math.max(0, sleptMs / 1000)); while (left > 0) { const dt = Math.min(0.5, left); S.tick(this.W, dt); left -= dt; } S.flushEvents(this.W); this.last = this.now(); }
  attach(peer) {
    const W = this.W; let pid = null, budget = 40;
    const conn = { peer, ctx: { last: new Map() }, get pid() { return pid; } };
    const refill = setInterval(() => { budget = Math.min(40, budget + 20); }, 1000); refill.unref && refill.unref();
    const send = (o) => peer.send(JSON.stringify(o));
    conn.message = async (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'join' && !pid && !conn.joining) {
        conn.joining = true;
        const token = String(m.token || '').slice(0, 64); if (token.length < 8) { send({ t: 'error', err: 'bad token' }); conn.joining = false; return; }
        const id = (await sha(token)).slice(0, 12);
        // a second tab with the same token takes over; the old one is closed
        for (const c of this.conns) if (c.pid === id) { try { c.peer.close(4000); } catch {} this.conns.delete(c); }
        const P = S.addPlayer(W, id, String(m.name || '').slice(0, 16) || 'Villager');
        if (!P) { send({ t: 'full' }); peer.close(1000); conn.joining = false; return; }
        pid = id; this.conns.add(conn); this.dirty = true;
        send({ t: 'welcome', id, tick: TICK_MS }); send({ t: 'snap', s: S.snapshot(W, pid, conn.ctx) });
        W.chat.push({ t: W.t, pid: 'sys', name: '', color: '#aaa', text: P.name + ' joined the valley' }); if (W.chat.length > 60) W.chat.shift();
        return;
      }
      if (!pid) return;
      if (m.t === 'cmd') {
        if (budget <= 0) return; budget--;
        const r = S.command(W, pid, m.c); this.dirty = true;
        if (r.ok === false) send({ t: 'nack', err: r.err || 'no', op: m.c && m.c.op });
      } else if (m.t === 'ping') send({ t: 'pong', n: m.n });
    };
    conn.close = () => { clearInterval(refill); this.conns.delete(conn); if (pid) { const still = [...this.conns].some(c => c.pid === pid); if (!still) S.removePlayer(W, pid); } this.dirty = true; };
    return conn;
  }
  step() {
    const now = this.now(); const dt = (now - this.last) / 1000; this.last = now; S.setNow(this.W, now);
    S.tick(this.W, dt); this.tickN++;
    if (this.tickN % SNAP_EVERY === 0) {
      const parts = S.publicParts(this.W);
      for (const c of this.conns) {
        if (!c.pid) continue;
        if ((c.peer.backlog || 0) > 400000) continue;      // slow client: skip, never queue
        try { c.peer.send(JSON.stringify({ t: 'snap', s: S.snapshot(this.W, c.pid, c.ctx, parts) })); } catch {}
      }
      S.flushEvents(this.W);
    }
  }
  serialize() { this.W.savedAt = this.now(); return S.serialize(this.W); }
  closeAll(code = 1001) { for (const c of [...this.conns]) { try { c.peer.close(code); } catch {} } }
}
