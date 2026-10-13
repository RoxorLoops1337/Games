// Hearthvale always-on server: static files + WebSocket game world for up to 16 villages.
//   node hearthvale/server/server.mjs            (PORT=7788, DATA_DIR=./data)
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { attachWebSocket } from './ws.mjs';
import * as S from '../shared/sim.js';
import { MAX_PLAYERS } from '../shared/data.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const TICK_MS = 100, SNAP_EVERY = 2, SAVE_MS = 30000;

export function createGameServer({ port = 7788, dataDir = null, serveStatic = true, seed = 1 } = {}) {
  let W = null; const file = dataDir && join(dataDir, 'world.json');
  if (file && existsSync(file)) { try { W = S.deserialize(readFileSync(file, 'utf8')); } catch (e) { console.error('save unreadable, starting fresh', e.message); } }
  W = W || S.createWorld(seed);
  const clients = new Set(); let tickN = 0;

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
    let pid = null, budget = 40, last = Date.now();
    const c = { ws, get pid() { return pid; } };
    const refill = setInterval(() => { budget = Math.min(40, budget + 20); }, 1000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'join' && !pid) {
        const token = String(m.token || '').slice(0, 64); if (token.length < 8) { ws.send(JSON.stringify({ t: 'error', err: 'bad token' })); return; }
        const id = createHash('sha256').update(token).digest('hex').slice(0, 12);
        const P = S.addPlayer(W, id, String(m.name || '').slice(0, 16) || 'Villager');
        if (!P) { ws.send(JSON.stringify({ t: 'full' })); ws.close(1000); return; }
        pid = id; clients.add(c);
        ws.send(JSON.stringify({ t: 'welcome', id, tick: TICK_MS }));
        ws.send(JSON.stringify({ t: 'snap', s: S.snapshot(W, pid) }));
        W.chat.push({ t: W.t, pid: 'sys', name: '', color: '#aaa', text: P.name + ' joined the valley' });
        return;
      }
      if (!pid) return;
      if (m.t === 'cmd') {
        if (budget <= 0) return; budget--;
        const r = S.command(W, pid, m.c);
        if (r.ok === false) ws.send(JSON.stringify({ t: 'nack', err: r.err || 'no', op: m.c && m.c.op }));
      } else if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', n: m.n }));
    });
    ws.on('close', () => { clearInterval(refill); clients.delete(c); if (pid) { S.removePlayer(W, pid); } });
  });

  function save() {
    if (!file) return;
    try { mkdirSync(dataDir, { recursive: true }); const tmp = file + '.tmp'; writeFileSync(tmp, S.serialize(W)); renameSync(tmp, file); } catch (e) { console.error('save failed', e.message); }
  }
  let loop = null, saver = null, last = 0;
  function start() {
    last = Date.now();
    loop = setInterval(() => {
      const now = Date.now(); const dt = (now - last) / 1000; last = now;
      S.tick(W, dt); tickN++;
      if (tickN % SNAP_EVERY === 0) {
        for (const c of clients) {
          if (c.ws.backlog > 400000) continue;           // slow client: skip, never queue
          c.ws.send(JSON.stringify({ t: 'snap', s: S.snapshot(W, c.pid) }));
        }
        S.flushEvents(W);
      }
    }, TICK_MS);
    saver = setInterval(save, SAVE_MS);
    return new Promise((res) => server.listen(port, () => res(server.address().port)));
  }
  function stop() { clearInterval(loop); clearInterval(saver); save(); for (const c of clients) c.ws.close(1001); return new Promise((res) => server.close(() => res())); }
  return { start, stop, world: () => W, clients };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 7788;
  const g = createGameServer({ port, dataDir: process.env.DATA_DIR || join(ROOT, 'data') });
  g.start().then((p) => console.log('Hearthvale server on http://localhost:' + p + '/  (max ' + MAX_PLAYERS + ' villages)'));
  const bye = () => g.stop().then(() => process.exit(0)); process.on('SIGINT', bye); process.on('SIGTERM', bye);
}
