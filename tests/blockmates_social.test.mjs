// Blockmates: trading between players and hired Buddies (chop, mine, farm, guard).
import assert from 'node:assert/strict';
import { World } from '../blockmates/server/world.js';
import { B, I, W, ITEMS } from '../blockmates/shared/data.js';
import { spawnNpc, findPath } from '../blockmates/server/npcs.js';
import * as mobsMod from '../blockmates/server/mobs.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; } };
function client(w, name) {
  const out = []; const id = w.connect((o) => out.push(o)); w.message(id, { t: 'join', name, token: 't' + name });
  return { id, out, p: () => w.players.get(id), last: (t) => [...out].reverse().find((o) => o.t === t) };
}
const run = (w, n) => { for (let i = 0; i < n; i++) w.tick(); };
// a clean flat arena: stone floor at row 60, air above, x0..x0+60
function arena(w, x0 = 700, w0 = 60) {
  for (let x = x0; x < x0 + w0; x++) { for (let y = 40; y < 60; y++) { w.setTile(x, y, 0, 0); w.setTile(x, y, 2, 0); } for (let y = 60; y < 66; y++) w.setTile(x, y, 0, B.stone); }
}
function place(w, c, x) { const p = c.p(); p.x = x + 0.5; p.y = 60; p.vx = p.vy = 0; p.known.clear(); }

test('trade swaps offers only when both confirm, and escrow protects items', () => {
  const w = new World({ seed: 3 });
  const a = client(w, 'Ann'), b = client(w, 'Ben'); run(w, 5);
  arena(w); place(w, a, 720); place(w, b, 722); run(w, 30);
  const pa = a.p(), pb = b.p();
  w.addItem(pa, I.gold_ingot, 5); w.addItem(pb, I.iron_ingot, 7);
  w.message(a.id, { t: 'trade', to: b.id });
  assert.ok(b.last('tradereq'));
  w.message(b.id, { t: 'tradeacc', from: a.id });
  assert.ok(a.last('trade') && b.last('trade'));
  const gs = pa.inv.findIndex((s) => s && s.id === I.gold_ingot), is = pb.inv.findIndex((s) => s && s.id === I.iron_ingot);
  w.message(a.id, { t: 'tradeadd', slot: gs, n: 3 });
  assert.equal(w.countItem(pa, I.gold_ingot), 2, 'escrowed');
  w.message(b.id, { t: 'tradeadd', slot: is, n: 7 });
  w.message(a.id, { t: 'tradeok' });
  assert.equal(w.countItem(pb, I.gold_ingot), 0, 'not yet');
  w.message(b.id, { t: 'tradeadd', slot: pb.inv.findIndex((s) => s && s.id === I.bread), n: 1 }); // changes the offer: confirmations reset
  assert.equal(b.last('trade').okTheirs, false);
  w.message(a.id, { t: 'tradeok' }); w.message(b.id, { t: 'tradeok' });
  assert.equal(w.countItem(pb, I.gold_ingot), 3); assert.equal(w.countItem(pa, I.iron_ingot), 7); assert.equal(w.countItem(pa, I.gold_ingot), 2);
  assert.ok(a.last('trade').done);
});

test('cancel and disconnect return escrowed items', () => {
  const w = new World({ seed: 3 });
  const a = client(w, 'Cat'), b = client(w, 'Dan'); run(w, 5);
  arena(w); place(w, a, 720); place(w, b, 721); run(w, 30);
  const pa = a.p(), pb = b.p();
  w.addItem(pa, I.copper_ingot, 9);
  w.message(a.id, { t: 'trade', to: b.id }); w.message(b.id, { t: 'tradeacc', from: a.id });
  w.message(a.id, { t: 'tradeadd', slot: pa.inv.findIndex((s) => s && s.id === I.copper_ingot), n: 9 });
  assert.equal(w.countItem(pa, I.copper_ingot), 0);
  w.message(b.id, { t: 'tradecancel' });
  assert.equal(w.countItem(pa, I.copper_ingot), 9, 'cancel returns');
  w.message(a.id, { t: 'trade', to: b.id }); w.message(b.id, { t: 'tradeacc', from: a.id });
  w.message(a.id, { t: 'tradeadd', slot: pa.inv.findIndex((s) => s && s.id === I.copper_ingot), n: 9 });
  w.disconnect(a.id);
  assert.equal(w.trades.size, 0);
  assert.equal(w.accounts.get('cat').inv.reduce((n, s) => n + (s && s.id === I.copper_ingot ? s.n : 0), 0), 9, 'saved back in the backpack');
});

test('path finding walks, steps up and drops down', () => {
  const w = new World({ seed: 3 }); client(w, 'Eli'); arena(w);
  const p = findPath(w, 705, 59, (x) => x === 709);
  assert.ok(p && p.length === 5, 'flat path');
  w.setTile(711, 59, 0, B.stone); w.setTile(711, 58, 0, B.stone);
  assert.equal(findPath(w, 705, 59, (x) => x === 714), null, 'a two tile wall blocks walkers');
  w.setTile(711, 58, 0, 0);
  const r = findPath(w, 705, 59, (x) => x === 714);
  assert.ok(r && r.some(([x, y]) => x === 711 && y === 58), 'steps up one tile');
  w.setTile(716, 60, 0, 0); w.setTile(716, 61, 0, 0); // a pit two deep
  const d = findPath(w, 705, 59, (x, y) => x === 716 && y === 61);
  assert.ok(d, 'drops into a pit');
});

function setup() {
  const w = new World({ seed: 3 });
  const c = client(w, 'Fay'); run(w, 5); arena(w); place(w, c, 720); run(w, 20);
  return { w, c, p: c.p() };
}

test('a bell hires a Buddy who follows the owner', () => {
  const { w, c, p } = setup();
  w.addItem(p, I.buddy_bell, 1);
  const s = p.inv.findIndex((q) => q && q.id === I.buddy_bell); p.inv[9] = p.inv[s]; p.inv[s] = null; p.sel = 9;
  w.message(c.id, { t: 'place', x: 722, y: 59, l: 0 });
  assert.equal(w.npcs.size, 1);
  const n = [...w.npcs.values()][0];
  p.x = 745.5; p.vx = 0; run(w, 30 * 14);
  assert.ok(Math.abs(n.x - p.x) < 6, 'followed, dx=' + (n.x - p.x));
  // others cannot command it
  const o = client(w, 'Gus'); place(w, o, 744); run(w, 10);
  w.message(o.id, { t: 'npc', id: n.id, act: 'job', job: 'chop' });
  assert.equal(n.job, 'follow');
  w.message(c.id, { t: 'npc', id: n.id, act: 'job', job: 'guard' });
  assert.equal(n.job, 'guard');
  w.message(c.id, { t: 'npc', id: n.id, act: 'dismiss' });
  assert.equal(w.npcs.size, 0); assert.equal(w.countItem(p, I.buddy_bell), 1);
});

test('a chopper fells a tree into the owner backpack', () => {
  const { w, p } = setup();
  for (let k = 1; k <= 4; k++) w.setTile(728, 60 - k, 0, B.log);
  const n = spawnNpc(w, 'Fay', p.x + 1, 60, 'chop');
  const before = w.countItem(p, I.log);
  run(w, 30 * 25);
  assert.ok(w.countItem(p, I.log) >= before + 3, 'logs ' + (w.countItem(p, I.log) - before));
  void n;
});

test('a farmer harvests and replants', () => {
  const { w, p } = setup();
  w.setTile(725, 59, 0, B.wheat2);
  w.addItem(p, I.seeds, 3);
  spawnNpc(w, 'Fay', p.x + 1, 60, 'farm');
  // wheat sits on stone here, so make the soil dirt
  w.setTile(725, 60, 0, B.dirt);
  run(w, 30 * 12);
  assert.ok(w.countItem(p, I.wheat) >= 1, 'wheat harvested');
  assert.equal(w.fgAt(725, 59), B.wheat0, 'replanted');
});

test('a miner digs exposed ore and a guard fights', () => {
  const { w, p } = setup();
  w.setTile(727, 59, 0, B.coal_ore);
  spawnNpc(w, 'Fay', p.x + 1, 60, 'mine');
  run(w, 30 * 12);
  assert.ok(w.countItem(p, I.coal) >= 1, 'coal mined');
  const g = spawnNpc(w, 'Fay', p.x + 2, 60, 'guard');
  const m = mobsMod.spawnMob(w, 'gloomling', p.x + 8, 60);
  m.ai.fleeT = 0;
  w.time = 600 * 0.7; // night so it does not burn
  p.hp = 20;
  let guard = 0;
  for (let i = 0; i < 30 * 20 && w.mobs.has(m.id); i++) { w.tick(); p.hp = 20; guard++; }
  assert.ok(!w.mobs.has(m.id), 'gloomling defeated by the guard (' + guard + ' ticks)');
  void g;
});

test('buddies are saved and restored', () => {
  const { w, p } = setup();
  spawnNpc(w, 'Fay', p.x, 60, 'chop');
  const st = JSON.parse(JSON.stringify(w.exportState()));
  const w2 = new World({ seed: 1 }); w2.importState(st);
  assert.equal(w2.npcs.size, 1); assert.equal([...w2.npcs.values()][0].job, 'chop');
});

console.log(`\n${passed} passed`);
void W; void ITEMS;
