// Hearthvale always-on server: static files + WebSocket game world for up to 16 villages.
//   node hearthvale/server/server.mjs            (PORT=7788, DATA_DIR=./data)
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { attachWebSocket } from './ws.mjs';
import * as S from '../shared/sim.js';
import { Host, TICK_MS } from '../shared/host.js';
import { MAX_PLAYERS } from '../shared/data.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const SAVE_MS = 30000;

export function createGameServer({ port = 7788, dataDir = null, serveStatic = true, seed = 1 } = {}) {
  let W = null; const file = dataDir && join(dataDir, 'world.json');
  if (file && existsSync(file)) { try { W = S.deserialize(readFileSync(file, 'utf8')); } catch (e) { console.error('save unreadable, starting fresh', e.message); } }
  W = W || S.createWorld(seed);
  const host = new Host({ world: W }); const clients = host.conns;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, online: clients.size, players: Object.keys(W.players).length, t: Math.round(W.t) })); return; }
    if (!serveStatic) { res.writeHead(404); res.end(); return; }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/') || p === '.') p = join(p, 'index.html');
    if (/^[/\\]?(server|tests)[/\\]/.test(p)) { res.writeHead(403); res.end(); return; }
    try { const data = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(data); }
    catch { res.writeHead(404); res.end('not found'); }
  });

  attachWebSocket(server, (ws) => {
    const conn = host.attach(ws);
    ws.on('message', (raw) => conn.message(raw));
    ws.on('close', () => conn.close());
  });

  function save() {
    if (!file) return;
    try { mkdirSync(dataDir, { recursive: true }); const tmp = file + '.tmp'; writeFileSync(tmp, host.serialize()); renameSync(tmp, file); } catch (e) { console.error('save failed', e.message); }
  }
  let loop = null, saver = null;
  function start() {
    host.last = Date.now();
    loop = setInterval(() => host.step(), TICK_MS);
    saver = setInterval(save, SAVE_MS);
    return new Promise((res) => server.listen(port, () => res(server.address().port)));
  }
  function stop() { clearInterval(loop); clearInterval(saver); save(); host.closeAll(); return new Promise((res) => server.close(() => res())); }
  return { start, stop, world: () => W, clients };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 7788;
  const g = createGameServer({ port, dataDir: process.env.DATA_DIR || join(ROOT, 'data') });
  g.start().then((p) => console.log('Hearthvale server on http://localhost:' + p + '/  (max ' + MAX_PLAYERS + ' villages)'));
  const bye = () => g.stop().then(() => process.exit(0)); process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
