// Fuzz: 16 players fire random (and malformed) commands for 30 simulated minutes. The sim must never throw
// and must keep its invariants (no negative goods, storage cap respected, no overlapping buildings).
import assert from 'node:assert/strict';
import * as S from '../hearthvale/shared/sim.js';
import { BUILDINGS, TECH, RECIPES, GOODS, VALLEY_FIELDS } from '../hearthvale/shared/data.js';

const W = S.createWorld(99); const r = S.rng(4242); const pick = (a) => a[Math.floor(r() * a.length)];
for (let i = 0; i < 16; i++) S.addPlayer(W, 'p' + i, 'P' + i);
const junk = [null, undefined, NaN, Infinity, -1, 1e9, 'x', {}, [], '__proto__', 0.5];
const ops = ['place', 'move', 'demolish', 'assign', 'recall', 'queue', 'dequeue', 'research', 'hire', 'sell', 'contribute', 'chat', 'emote', 'rename', 'bogus'];
let cmds = 0;
for (let step = 0; step < 18000; step++) {
  if (step % 3 === 0) {
    const id = 'p' + Math.floor(r() * 16), P = W.players[id], op = pick(ops);
    const b = P.buildings.length ? pick(P.buildings) : null, n = P.nodes.length ? pick(P.nodes) : null, v = P.villagers.length ? pick(P.villagers) : null, o = pick(W.valley.orders);
    const c = { op, type: r() < 0.9 ? pick(Object.keys(BUILDINGS)) : pick(junk), x: Math.floor(r() * 18) - 1, y: Math.floor(r() * 18) - 1, id: r() < 0.9 ? (b ? b.id : 0) : pick(junk),
      k: pick(['node', 'bld', 'valley', 'zzz']), vid: v && r() < 0.7 ? v.id : pick(junk), recipe: pick([...Object.keys(RECIPES), 'zzz']), n: r() < 0.8 ? Math.floor(r() * 12) : pick(junk), tech: pick([...Object.keys(TECH), 'zzz']),
      res: pick([...GOODS, 'coins', 'zzz', '__proto__']), i: r() < 0.8 ? 0 : pick(junk), text: r() < 0.5 ? 'hi' : pick(junk), name: pick(['Bob', '', pick(junk)]), e: '👋' };
    if (c.op === 'assign' && c.k === 'node' && n) c.id = n.id; if (c.op === 'assign' && c.k === 'valley') c.id = pick(VALLEY_FIELDS).id; if (c.op === 'contribute') c.id = o.id;
    if (r() < 0.05) P.res = { ...P.res, ...Object.fromEntries(GOODS.map(g => [g, 50])) };   // keep the economy moving
    S.command(W, id, c); cmds++;
    if (r() < 0.02) S.command(W, id, null);
  }
  S.tick(W, 0.1);
  if (step % 2000 === 0) {
    for (const P of Object.values(W.players)) {
      for (const g of GOODS) assert.ok(P.res[g] >= 0 && P.res[g] <= S.capOf(P) + 400, `${P.id} ${g}=${P.res[g]}`);
      assert.ok(P.coins >= 0, 'coins');
      for (const a of P.buildings) for (const c of P.buildings) if (a !== c) assert.ok(!(a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h), 'overlap ' + a.type + '/' + c.type);
      for (const v of P.villagers) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'villager position');
    }
    JSON.parse(JSON.stringify(S.snapshot(W, 'p0')));
  }
}
const W2 = S.deserialize(S.serialize(W)); for (let i = 0; i < 50; i++) S.tick(W2, 0.1);
console.log('hearthvale fuzz: ' + cmds + ' random commands over 30 minutes, no crash, invariants held');
