#!/usr/bin/env node
// Self-hosted Blockmates server with no dependencies: a tiny RFC 6455 WebSocket implementation on node:http.
// Usage: node server/node.js [--port 8787] [--save world.json] [--seed 1337] [--password x] [--ops name,name]
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from './world.js';
import { TICK } from '../shared/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }; // nothing else is served, so a save file in this folder stays private
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function startServer(opts = {}) {
  const world = opts.world || new World(opts);
  const save = opts.save;
  if (save && fs.existsSync(save)) {
    try {
      const j = JSON.parse(fs.readFileSync(save, 'utf8'));
      world.importState(j.state);
      for (const [cx, b] of Object.entries(j.chunks || {})) world.importChunk(+cx, b);
      console.log(`loaded ${save}: day ${world.day}, ${Object.keys(j.chunks || {}).length} chunks, ${world.accounts.size} players`);
    } catch (e) { console.error('could not read save', e.message); }
  }
  const doSave = () => {
    if (!save) return;
    const chunks = { ...(world._savedChunks || {}), ...world.exportDirtyChunks() };
    world._savedChunks = chunks;
    fs.writeFileSync(save + '.tmp', JSON.stringify({ state: world.exportState(), chunks }));
    fs.renameSync(save + '.tmp', save);
  };
  if (save && fs.existsSync(save)) { try { world._savedChunks = JSON.parse(fs.readFileSync(save, 'utf8')).chunks || {}; } catch { world._savedChunks = {}; } }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/status') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ name: world.name, players: world.players.size, max: world.maxPlayers, day: world.day, password: !!world.password, motd: world.motd, tickMs: +(world.stats.tickMs || 0).toFixed(2), tickMax: +(world.stats.tickMax || 0).toFixed(2), chunks: world.chunks.size, mobs: world.mobs.size }));
      return;
    }
    // the same process also serves the game page, so a LAN or VPS host needs nothing else
    let rel = decodeURIComponent(u.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !MIME[path.extname(file)] || file === path.join(ROOT, 'server', 'node.js') || file.startsWith(path.join(ROOT, 'server', 'cf'))) { res.writeHead(404); res.end('not found'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Blockmates server. Open / for the game.'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)], 'cache-control': 'no-cache' });
      res.end(data);
    });
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    let buf = Buffer.alloc(0);
    let frag = null;
    const send = (obj) => {
      if (socket.destroyed) return;
      const payload = Buffer.from(JSON.stringify(obj));
      socket.write(frame(payload, 0x1));
    };
    send.close = () => socket.end(frame(Buffer.alloc(0), 0x8));
    const id = world.connect(send);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > 1 << 20) { socket.destroy(); return; }
      for (;;) {
        const f = parseFrame(buf);
        if (!f) break;
        buf = buf.subarray(f.used);
        if (f.op === 0x8) { socket.end(frame(Buffer.alloc(0), 0x8)); return; }
        if (f.op === 0x9) { socket.write(frame(f.data, 0xa)); continue; }
        if (f.op === 0x1 || f.op === 0x0) {
          frag = f.op === 0x1 ? [f.data] : (frag || []).concat([f.data]);
          if (f.fin) {
            const text = Buffer.concat(frag).toString('utf8'); frag = null;
            try { world.message(id, JSON.parse(text)); } catch (e) { /* bad json: ignore */ }
          }
        }
      }
    });
    const bye = () => { try { world.disconnect(id); } catch { /* already gone */ } };
    socket.on('close', bye); socket.on('error', bye);
  });

  const timer = setInterval(() => {
    const t0 = process.hrtime.bigint();
    try { world.tick(); } catch (e) { console.error('tick error', e); }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    world.stats.tickMs = (world.stats.tickMs || ms) * 0.98 + ms * 0.02; world.stats.tickMax = Math.max(ms, (world.stats.tickMax || 0) * 0.999);
  }, 1000 / TICK);
  const saver = setInterval(doSave, 30000);
  const port = opts.port ?? 8787;
  server.listen(port, opts.host || '0.0.0.0');
  const stop = () => { clearInterval(timer); clearInterval(saver); doSave(); server.close(); for (const s of server._socks || []) s.destroy(); };
  return { world, server, port, stop, save: doSave };
}

function frame(payload, op) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}
function parseFrame(b) {
  if (b.length < 2) return null;
  const fin = !!(b[0] & 0x80), op = b[0] & 0xf, masked = !!(b[1] & 0x80);
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  const mlen = masked ? 4 : 0;
  if (b.length < off + mlen + len) return null;
  const data = Buffer.from(b.subarray(off + mlen, off + mlen + len));
  if (masked) for (let i = 0; i < len; i++) data[i] ^= b[off + (i & 3)];
  return { fin, op, data, used: off + mlen + len };
}

if (process.argv[1] && process.argv[1].endsWith('node.js')) {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const s = startServer({
    port: +get('port', process.env.PORT || 8787), save: get('save', 'blockmates-world.json'), seed: +get('seed', 1337),
    password: get('password', ''), ops: get('ops', '').split(',').filter(Boolean), name: get('name', 'Blockmates World'),
  });
  console.log(`Blockmates server on :${s.port}  (world "${s.world.name}", seed ${s.world.seed})`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { s.stop(); process.exit(0); });
}
