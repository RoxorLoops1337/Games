// Fuzz: 16 players fire random (and malformed) commands for 30 simulated minutes. The sim must never throw
// and must keep its invariants (no negative goods, storage cap respected, no overlapping buildings).
import assert from 'node:assert/strict';
import * as S from '../hearthvale/shared/sim.js';
import { BUILDINGS, TECH, RECIPES, GOODS, VALLEY_FIELDS, ANIMALS, ACHIEVEMENTS, STOCK_CAP } from '../hearthvale/shared/data.js';

const W = S.createWorld(99); const r = S.rng(4242); const pick = (a) => a[Math.floor(r() * a.length)];
for (let i = 0; i < 16; i++) S.addPlayer(W, 'p' + i, 'P' + i);
const junk = [null, undefined, NaN, Infinity, -1, 1e9, 'x', {}, [], '__proto__', 0.5];
const ops = ['gift', 'upgrade', 'place', 'move', 'demolish', 'assign', 'recall', 'queue', 'dequeue', 'research', 'hire', 'sell', 'contribute', 'chat', 'emote', 'rename', 'bogus', 'buyAnimal', 'renameVillager', 'projectGive', 'daily', 'setTitle', 'visitorServe', 'merchantTrade'];
let cmds = 0;
for (let step = 0; step < 18000; step++) {
  if (step % 3 === 0) {
    const id = 'p' + Math.floor(r() * 16), P = W.players[id], op = pick(ops);
    const b = P.buildings.length ? pick(P.buildings) : null, n = P.nodes.length ? pick(P.nodes) : null, v = P.villagers.length ? pick(P.villagers) : null, o = pick(W.valley.orders);
    const c = { op, type: r() < 0.9 ? pick(Object.keys(BUILDINGS)) : pick(junk), x: Math.floor(r() * 18) - 1, y: Math.floor(r() * 18) - 1, id: r() < 0.9 ? (b ? b.id : 0) : pick(junk),
      k: pick(['node', 'bld', 'valley', 'zzz']), vid: v && r() < 0.7 ? v.id : pick(junk), recipe: pick([...Object.keys(RECIPES), 'zzz']), n: r() < 0.8 ? Math.floor(r() * 12) : pick(junk), tech: pick([...Object.keys(TECH), 'zzz']),
      res: pick([...GOODS, 'coins', 'zzz', '__proto__']), i: r() < 0.8 ? 0 : pick(junk), text: r() < 0.5 ? 'hi' : pick(junk), name: pick(['Bob', '', pick(junk)]), e: '👋', to: r() < 0.7 ? 'p' + Math.floor(r() * 16) : pick(junk),
      kind: r() < 0.8 ? pick([...Object.keys(ANIMALS), 'zzz']) : pick(junk), with: pick(['goods', 'coins', 'zzz', pick(junk)]) };
    if (op === 'buyAnimal' && r() < 0.5) { const hs = P.buildings.filter(x => x.an); if (hs.length) c.id = pick(hs).id; }
    if (op === 'setTitle') c.id = r() < 0.6 ? pick(ACHIEVEMENTS).id : pick(junk); if (op === 'merchantTrade') c.i = r() < 0.7 ? Math.floor(r() * 3) : pick(junk); if (op === 'renameVillager' && v && r() < 0.5) c.vid = v.id;
    if (op === 'place' && r() < 0.6) { if (r() < 0.3) c.type = pick(['coop', 'barn', 'orchard', 'dock', 'dairy']); const d = BUILDINGS[c.type]; const sp = d && S.findSpot(P, d.w, d.h, 0); if (sp) { c.x = sp.x; c.y = sp.y; } }
    if (c.op === 'assign' && c.k === 'node' && n) c.id = n.id; if (c.op === 'assign' && c.k === 'valley') c.id = pick(VALLEY_FIELDS).id; if (c.op === 'contribute') c.id = o.id;
    if (r() < 0.01) { P.level = Math.max(P.level, 10); for (const t of Object.keys(TECH)) P.tech[t] = true; }
    if (r() < 0.05) P.res = { ...P.res, ...Object.fromEntries(GOODS.map(g => [g, 50])) }; if (r() < 0.05) P.coins += 300;   // keep the economy moving
    const res = S.command(W, id, c); cmds++; assert.ok(!(res && res.err === 'error'), 'command threw: ' + JSON.stringify(c));
    if (r() < 0.02) S.command(W, id, null);
  }
  S.setNow(W, 1.7e12 + step * 100 * (r() < 0.001 ? 1000 : 1) - (r() < 0.002 ? 5e8 : 0)); S.tick(W, 0.1);
  if (step % 2000 === 0) {
    for (const P of Object.values(W.players)) {
      for (const g of GOODS) assert.ok(P.res[g] >= 0 && P.res[g] <= S.capOf(P) + 400, `${P.id} ${g}=${P.res[g]}`);
      assert.ok(P.coins >= 0, 'coins');
      for (const b of P.buildings) if (b.an) { assert.ok(S.stockOf(b) <= STOCK_CAP, 'stock cap'); assert.ok(S.animalCount(b) <= S.animalCap(b), 'animal cap'); }
      for (const v of P.villagers) assert.ok(v.skx.every(Number.isFinite), 'skills');
      assert.ok(Number.isFinite(P.xp) && Number.isFinite(P.charm), 'xp and charm');
      for (const a of P.buildings) for (const c of P.buildings) if (a !== c) assert.ok(!(a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h), 'overlap ' + a.type + '/' + c.type);
      for (const v of P.villagers) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'villager position');
    }
    JSON.parse(JSON.stringify(S.snapshot(W, 'p0')));
  }
}
assert.ok(W.valley.project.stage >= 0, 'project');
// after the chaos every built pen can still be stocked and run
let stocked = 0; for (const P of Object.values(W.players)) for (const b of P.buildings) if (b.an && b.built) { P.coins = 5000; const kind = b.type === 'coop' ? 'chicken' : 'cow'; if (S.animalCount(b) < S.animalCap(b)) { assert.ok(S.command(W, P.id, { op: 'buyAnimal', id: b.id, kind }).ok, 'buy after the fuzz'); stocked++; } }
assert.ok(stocked > 0, 'the fuzz left pens to stock');
for (let i = 0; i < 600; i++) S.tick(W, 0.1);
const W2 = S.deserialize(S.serialize(W)); for (let i = 0; i < 50; i++) S.tick(W2, 0.1);
console.log('hearthvale fuzz: ' + cmds + ' random commands over 30 minutes, no crash, invariants held');
