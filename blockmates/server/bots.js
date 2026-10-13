#!/usr/bin/env node
// Load test / demo: N bots join a server, wander, jump, mine, place and chat.
//   node blockmates/server/bots.js ws://localhost:8787/ws 16 30
// Needs Node 22 (global WebSocket). Prints bandwidth and message counts at the end.
import { K_LEFT, K_RIGHT, K_JUMP } from '../shared/physics.js';

export async function runBots({ url, n = 16, seconds = 20, prefix = 'Bot', log = () => {} }) {
  const bots = [];
  let bytes = 0, msgs = 0;
  for (let i = 0; i < n; i++) {
    const ws = new WebSocket(url);
    const b = { ws, name: prefix + i, id: 0, you: null, dir: Math.random() < 0.5 ? -1 : 1, welcomed: false, chunks: 0, snaps: 0 };
    ws.onmessage = (e) => {
      bytes += e.data.length; msgs++;
      const m = JSON.parse(e.data);
      if (m.t === 'welcome') { b.id = m.id; b.welcomed = true; }
      else if (m.t === 'c') b.chunks++;
      else if (m.t === 's') { b.snaps++; b.you = m.you; b.players = m.p.length; }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('connect failed')); });
    ws.send(JSON.stringify({ t: 'join', name: b.name, token: 'bot' + i }));
    bots.push(b);
  }
  const t0 = Date.now();
  let step = 0;
  const timer = setInterval(() => {
    step++;
    for (const b of bots) {
      if (!b.welcomed || ws_closed(b)) continue;
      if (step % 40 === 0 && Math.random() < 0.4) b.dir = -b.dir;
      const keys = (b.dir > 0 ? K_RIGHT : K_LEFT) | (Math.random() < 0.05 ? K_JUMP : 0);
      b.ws.send(JSON.stringify({ t: 'i', k: keys, s: step }));
      if (b.you && step % 10 === 0) {
        const x = Math.floor(b.you.x) + b.dir * 2, y = Math.floor(b.you.y) - 1;
        b.ws.send(JSON.stringify({ t: 'mine', x, y: y + 1, l: 0 }));
      }
      if (step % 150 === 0) b.ws.send(JSON.stringify({ t: 'chat', text: 'hello from ' + b.name }));
    }
  }, 33);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  clearInterval(timer);
  const secs = (Date.now() - t0) / 1000;
  const stats = { bots: n, seconds: secs, kbPerSecPerBot: bytes / 1024 / secs / n, msgsPerSec: msgs / secs, welcomed: bots.filter((b) => b.welcomed).length, minSnaps: Math.min(...bots.map((b) => b.snaps)) };
  for (const b of bots) b.ws.close();
  log(stats);
  return stats;
}
const ws_closed = (b) => b.ws.readyState !== 1;

if (process.argv[1] && process.argv[1].endsWith('bots.js')) {
  const [url = 'ws://localhost:8787/ws', n = '16', secs = '20'] = process.argv.slice(2);
  runBots({ url, n: +n, seconds: +secs, log: (s) => console.log(JSON.stringify(s, null, 2)) }).then(() => process.exit(0));
}
