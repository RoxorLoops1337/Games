// Minimal zero-dependency WebSocket server (RFC 6455): text frames, ping/pong, close.
import { createHash } from 'node:crypto';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function attachWebSocket(httpServer, onConnection, { maxPayload = 16384 } = {}) {
  httpServer.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const ws = new Peer(socket, maxPayload);
    onConnection(ws, req);
  });
}

class Peer {
  constructor(socket, maxPayload) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.alive = true; this.handlers = {}; this.max = maxPayload; this.frag = null;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); try { this.parse(); } catch { this.close(1002); } });
    socket.on('close', () => this.end()); socket.on('error', () => this.end());
  }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  end() { if (!this.alive) return; this.alive = false; this.handlers.close && this.handlers.close(); }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = !!(b[0] & 0x80), op = b[0] & 0x0f, masked = !!(b[1] & 0x80); let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > this.max) throw new Error('too big');
      if (!masked) throw new Error('unmasked');
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op === 8) { this.close(1000); return; }
      if (op === 9) { this.frame(10, data); continue; }
      if (op === 10) { this.alive2 = true; continue; }
      if (op === 1 || op === 0 || op === 2) {
        if (op !== 0) this.frag = { parts: [], bin: op === 2 };
        if (!this.frag) throw new Error('bad frag');
        this.frag.parts.push(data);
        if (fin) { const all = Buffer.concat(this.frag.parts); this.frag = null; this.handlers.message && this.handlers.message(all.toString('utf8')); }
      }
    }
  }
  frame(op, payload) {
    if (!this.alive) return;
    const len = payload.length; let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(str) { this.frame(1, Buffer.from(str, 'utf8')); }
  get backlog() { return this.socket.writableLength; }
  ping() { this.frame(9, Buffer.alloc(0)); }
  close(code = 1000) { if (!this.alive) return; const p = Buffer.alloc(2); p.writeUInt16BE(code); this.frame(8, p); this.socket.end(); this.end(); }
}
