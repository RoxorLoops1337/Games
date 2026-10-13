// Two ways to reach a world: a WebSocket to a server, or a loopback to a World that runs right here (solo play).
import { World } from '../server/world.js';
import { TICK } from '../shared/data.js';

export class WSNet {
  constructor(url) {
    this.url = url; this.ws = null; this.onmsg = () => {}; this.onclose = () => {}; this.onopen = () => {};
  }
  open() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      this.ws = ws;
      ws.onopen = () => { this.onopen(); resolve(); };
      ws.onerror = () => reject(new Error('Could not reach the server.'));
      ws.onclose = () => this.onclose();
      ws.onmessage = (e) => { try { this.onmsg(JSON.parse(e.data)); } catch { /* ignore garbage */ } };
    });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws.close(); } catch { /* closed */ } }
}

// Solo: the same World class as the server, ticked from a timer. State is saved to IndexedDB.
export class LoopNet {
  constructor(store, seed) {
    this.store = store; this.seed = seed; this.onmsg = () => {}; this.onclose = () => {}; this.world = null; this.timer = null; this.saver = null;
  }
  async open() {
    const w = new World({ seed: this.seed, name: 'Solo world', maxPlayers: 1 });
    let saved = null;
    try { saved = await this.store.load(); } catch { /* no save */ }
    if (saved) {
      w.importState(saved.state);
      for (const [cx, b] of Object.entries(saved.chunks || {})) w.importChunk(+cx, b);
      w._savedChunks = saved.chunks || {};
    } else w._savedChunks = {};
    this.world = w;
    this.id = w.connect((o) => { const c = JSON.parse(JSON.stringify(o)); queueMicrotask(() => this.onmsg(c)); });
    let last = performance.now(), acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now(); acc += Math.min(250, now - last); last = now;
      while (acc >= 1000 / TICK) { acc -= 1000 / TICK; w.tick(); }
    }, 1000 / TICK / 2);
    this.saver = setInterval(() => this.save(), 20000);
    addEventListener('pagehide', () => this.save());
  }
  send(o) { if (this.world) this.world.message(this.id, JSON.parse(JSON.stringify(o))); }
  async save() {
    const w = this.world; if (!w) return;
    w._savedChunks = { ...w._savedChunks, ...w.exportDirtyChunks() };
    try { await this.store.save({ state: w.exportState(), chunks: w._savedChunks }); } catch { /* storage full or blocked */ }
  }
  async close() { clearInterval(this.timer); clearInterval(this.saver); await this.save(); this.world.disconnect(this.id); }
}

export const idbStore = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open('blockmates', 1); r.onupgradeneeded = () => r.result.createObjectStore('w'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async load() { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('w').objectStore('w').get('solo'); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); },
  async save(v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('w', 'readwrite'); t.objectStore('w').put(v, 'solo'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); },
  async wipe() { const db = await this.open(); return new Promise((res) => { const t = db.transaction('w', 'readwrite'); t.objectStore('w').delete('solo'); t.oncomplete = () => res(); }); },
};
