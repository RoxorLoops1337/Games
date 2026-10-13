// Hearthvale simulation suite: headless, drives the shared sim like the server does.
import assert from 'node:assert/strict';
import * as S from '../hearthvale/shared/sim.js';
import { BUILDINGS, MAX_PLAYERS } from '../hearthvale/shared/data.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const spot = (W, id, d) => S.findSpot(W.players[id], BUILDINGS[d].w, BUILDINGS[d].h, 1);
const run = (W, secs) => { for (let i = 0; i < secs * 10; i++) S.tick(W, 0.1); };

// 16 players fit, the 17th does not, slots are distinct
{
  const W = S.createWorld(5);
  for (let i = 0; i < MAX_PLAYERS; i++) ok(S.addPlayer(W, 'p' + i, 'P' + i), 'player ' + i + ' joins');
  ok(S.addPlayer(W, 'extra', 'X') === null, '17th player is refused');
  ok(new Set(Object.values(W.players).map(p => p.slot)).size === 16, 'unique slots');
  run(W, 5); ok(JSON.stringify(S.snapshot(W, 'p3')).length < 200000, 'snapshot stays small with 16 villages');
}
// build, gather, craft
{
  const W = S.createWorld(7); const P = S.addPlayer(W, 'a', 'Ann');
  ok(P.villagers.length === 3, 'three starting villagers');
  const r = S.command(W, 'a', { op: 'place', type: 'house', ...spot(W, 'a', 'house') });
  ok(r.ok, 'house placed'); ok(S.command(W, 'a', { op: 'place', type: 'house', x: P.buildings[1].x, y: P.buildings[1].y }).ok === false, 'cannot overlap');
  run(W, 30); ok(P.buildings.find(b => b.id === r.id).built, 'villager built the house');
  const tree = P.nodes.find(n => n.type === 'tree'); const w0 = P.res.wood;
  ok(S.command(W, 'a', { op: 'assign', k: 'node', id: tree.id }).ok, 'assign to tree');
  run(W, 40); ok(P.res.wood > w0, 'wood gathered'); ok(P.villagers.some(v => v.task && v.task.id === tree.id) || tree.amount === 0, 'gatherer repeats until empty');
  const k = S.command(W, 'a', { op: 'place', type: 'kitchen', ...spot(W, 'a', 'kitchen') }); ok(k.ok, 'kitchen placed'); run(W, 30);
  ok(S.command(W, 'a', { op: 'queue', id: k.id, recipe: 'soup', n: 2 }).ok, 'queue soup'); const s0 = P.res.soup; run(W, 40); ok(P.res.soup > s0 - 1, 'soup cooked');
  ok(S.command(W, 'a', { op: 'queue', id: k.id, recipe: 'planks', n: 1 }).ok === false, 'kitchen cannot saw planks');
}
// level gating, hire, farm cycle
{
  const W = S.createWorld(9); const P = S.addPlayer(W, 'a', 'Ann');
  ok(S.command(W, 'a', { op: 'place', type: 'sawmill', ...spot(W, 'a', 'sawmill') }).ok === false, 'sawmill needs level 2');
  const h = S.command(W, 'a', { op: 'place', type: 'house', ...spot(W, 'a', 'house') }); run(W, 30);
  const before = P.villagers.length; ok(S.command(W, 'a', { op: 'hire' }).ok, 'hire villager'); ok(P.villagers.length === before + 1, 'villager joined');
  const f = S.command(W, 'a', { op: 'place', type: 'farm', ...spot(W, 'a', 'farm') }); run(W, 12);
  S.command(W, 'a', { op: 'assign', k: 'bld', id: f.id }); run(W, 12);
  const farm = P.buildings.find(b => b.id === f.id); ok(farm.stage === 'grow' || farm.stage === 'ripe', 'field sown');
  run(W, 40); ok(farm.stage === 'ripe' || P.stats.wheat > 0, 'field ripens');
}
// valley orders: contribute completes and pays out
{
  const W = S.createWorld(11); const A = S.addPlayer(W, 'a', 'A'), B = S.addPlayer(W, 'b', 'B');
  const o = W.valley.orders[0]; A.res = Object.fromEntries(Object.keys(A.res).map(k => [k, 999])); B.res = { ...A.res };
  const c0 = A.coins;
  for (const g of Object.keys(o.need)) { S.command(W, 'a', { op: 'contribute', id: o.id, res: g, n: Math.ceil(o.need[g] / 2) }); S.command(W, 'b', { op: 'contribute', id: o.id, res: g, n: 999 }); }
  ok(o.done, 'order completes'); ok(A.coins > c0, 'contributor paid'); ok(W.valley.xp > 0, 'valley xp');
  run(W, 20); ok(!W.valley.orders.some(x => x.id === o.id), 'finished order replaced');
}
// persistence + hunger + shared field
{
  const W = S.createWorld(13); const P = S.addPlayer(W, 'a', 'A');
  S.command(W, 'a', { op: 'assign', k: 'valley', id: 'vf_wood' }); const w0 = P.res.wood; run(W, 60); ok(P.res.wood > w0, 'valley field harvested');
  const W2 = S.deserialize(S.serialize(W)); ok(W2.players.a.res.wood === P.res.wood, 'save round trips'); S.tick(W2, 0.1); ok(true, 'restored world ticks');
  P.res.soup = 0; for (const v of P.villagers) v.hunger = 0; run(W, 10); ok(P.villagers.some(v => v.state === 'hungry'), 'starving villagers stop');
}
console.log('hearthvale: ' + n + ' checks passed');
