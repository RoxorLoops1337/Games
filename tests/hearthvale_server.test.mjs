// Starts a real Hearthvale server and connects 16 WebSocket players (plus a 17th that is turned away).
import assert from 'node:assert/strict';
import { createGameServer } from '../hearthvale/server/server.mjs';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const g = createGameServer({ port: 0, serveStatic: true });
const port = await g.start();
const connect = (i) => new Promise((resolve, reject) => {
  const ws = new WebSocket('ws://127.0.0.1:' + port); const c = { ws, snaps: 0, last: null, msgs: [] };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', token: 'token-number-' + i, name: 'P' + i }));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'welcome') { c.id = m.id; resolve(c); } if (m.t === 'full') resolve(c); if (m.t === 'snap') { c.snaps++; c.last = m.s; c.k = c.k || {}; for (const p of m.s.players) { c.k[p.id] = c.k[p.id] || {}; if (p.n) c.k[p.id].n = p.n; if (p.b) c.k[p.id].b = p.b; } c.bytes = (c.bytes || 0) + e.data.length; } };
  ws.onerror = reject;
});
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const cs = []; for (let i = 0; i < 17; i++) cs.push(await connect(i));
ok(cs.slice(0, 16).every(c => c.id), '16 players welcomed'); ok(cs[16].msgs.some(m => m.t === 'full'), '17th is told the valley is full');
await wait(1200);
ok(cs[0].snaps >= 3, 'snapshots stream'); ok(cs[0].last.players.length === 16, 'everyone sees 16 villages');
// command round trip
const A = cs[0]; const wood0 = A.last.you.res.wood; const tree = A.k[A.id].n.find(x => x[1] === 'tree');
A.ws.send(JSON.stringify({ t: 'cmd', c: { op: 'assign', k: 'node', id: tree[0] } }));
await wait(9000); ok(A.last.you.res.wood > wood0, 'gathering over the wire works');
ok(!('you' in cs[1].last) || cs[1].last.you.id === cs[1].id, 'each client gets only its own private data');
A.ws.send(JSON.stringify({ t: 'cmd', c: { op: 'place', type: 'sawmill', x: 0, y: 0 } })); await wait(300);
ok(A.msgs.some(m => m.t === 'nack'), 'bad commands are rejected');
const health = await (await fetch('http://127.0.0.1:' + port + '/health')).json(); ok(health.online === 16, 'health reports 16 online');
const page = await fetch('http://127.0.0.1:' + port + '/'); ok(page.status === 404 || page.status === 200, 'static route answers');
ok(cs[0].last.players.some(p => !p.n && !p.b), 'unchanged villages are not resent (delta snapshots)');
ok(cs[0].bytes / cs[0].snaps < 20000, 'average snapshot is small: ' + Math.round(cs[0].bytes / cs[0].snaps) + ' bytes with 16 villages');
// the new systems travel over the wire: project, daily reward (the host supplies the clock), public charm and title
ok(A.last.valley.project && A.last.valley.project.stage === 0 && 'rain' in A.last.valley && A.last.valley.next.festival > 0, 'valley project, weather and schedule in the snapshot');
ok(A.last.you.daily.clock === true && A.last.you.daily.available === true, 'the host clock makes the daily reward available'); const coins0 = A.last.you.coins;
A.ws.send(JSON.stringify({ t: 'cmd', c: { op: 'daily' } })); await wait(500); ok(A.last.you.coins > coins0 && A.last.you.daily.available === false, 'daily reward claimed over the wire');
ok(typeof A.last.players[0].charm === 'number' && typeof A.last.players[0].title === 'string' && A.last.players.every(p => p.v.every(v => v.length === 9)), 'public charm and title');
// reconnect keeps the village
const idA = A.id; A.ws.close(); await wait(300); const A2 = await connect(0); ok(A2.id === idA, 'same token returns the same village');
for (const c of cs) try { c.ws.close(); } catch {} 
await g.stop(); console.log('hearthvale server: ' + n + ' checks passed'); process.exit(0);
