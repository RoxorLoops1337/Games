// Blockmates: the Node WebSocket server end to end with real sockets (Node 22 global WebSocket).
import assert from 'node:assert/strict';
import { startServer } from '../blockmates/server/node.js';
import { MAX_PLAYERS, B } from '../blockmates/shared/data.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let passed = 0;
const srv = startServer({ port: 0, seed: 21 });
await new Promise((r) => srv.server.once('listening', r));
const port = srv.server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const b = { ws, msgs: [], name };
  ws.onmessage = (e) => b.msgs.push(JSON.parse(e.data));
  b.open = new Promise((r) => { ws.onopen = r; });
  b.send = (o) => ws.send(JSON.stringify(o));
  b.last = (t) => [...b.msgs].reverse().find((m) => m.t === t);
  return b;
}
const ok = (n) => { passed++; console.log('ok  ' + n); };

try {
  const r = await fetch(`http://127.0.0.1:${port}/status`).then((x) => x.json());
  assert.equal(r.max, MAX_PLAYERS); ok('status endpoint');
  const html = await fetch(`http://127.0.0.1:${port}/`).then((x) => x.text());
  assert.ok(html.includes('Blockmates')); ok('serves the game page');
  assert.equal((await fetch(`http://127.0.0.1:${port}/server/node.js`)).status, 404); ok('does not serve server code');

  const bots = [];
  for (let i = 0; i < MAX_PLAYERS; i++) { const b = bot('Bot' + i); await b.open; b.send({ t: 'join', name: b.name, token: 'tok' + i }); bots.push(b); }
  await sleep(500);
  assert.ok(bots.every((b) => b.last('welcome')), 'everyone welcomed');
  assert.equal(srv.world.players.size, MAX_PLAYERS); ok('16 sockets join');
  const extra = bot('Late'); await extra.open; extra.send({ t: 'join', name: 'Late', token: 'x' });
  await sleep(300);
  assert.ok(extra.last('deny')); ok('17th is refused');

  bots[0].send({ t: 'chat', text: 'hello all' });
  bots.forEach((b, i) => { if (i % 2) b.send({ t: 'i', k: 2, s: 1 }); });
  await sleep(1500);
  assert.ok(bots.every((b) => b.msgs.some((m) => m.t === 'chat' && m.text === 'hello all'))); ok('chat reaches everybody');
  const snap = bots[3].last('s');
  assert.ok(snap && snap.p.length === MAX_PLAYERS && snap.you); ok('snapshots list all players');
  assert.ok(bots[3].msgs.filter((m) => m.t === 'c').length >= 3); ok('chunks stream in');
  const moved = srv.world.players.get(bots[1].msgs.find((m) => m.t === 'welcome').id);
  assert.ok(moved.x > srv.world.spawn.x + 1, 'moving right'); ok('input moves the player');

  bots[4].ws.close();
  await sleep(300);
  assert.equal(srv.world.players.size, MAX_PLAYERS - 1); ok('disconnect frees a slot');
  for (const b of bots) b.ws.close();

  // the save file round trip, with the file sitting inside the served folder
  const file = path.join(os.tmpdir(), 'bm-net-test-' + process.pid + '.json');
  const a = startServer({ port: 0, seed: 77, save: file });
  await new Promise((r) => a.server.once('listening', r));
  a.world.chunk(10); a.world.setTile(330, 100, 0, B.gold_block);
  a.stop();
  assert.ok(fs.existsSync(file)); ok('save file is written on stop');
  const again = startServer({ port: 0, seed: 1, save: file });
  await new Promise((r) => again.server.once('listening', r));
  assert.equal(again.world.fgAt(330, 100), B.gold_block); ok('and loaded again by the next server');
  again.stop(); fs.unlinkSync(file);
} finally {
  srv.stop();
}
console.log(`\n${passed} passed`);
process.exit(passed === 12 ? 0 : 1);
