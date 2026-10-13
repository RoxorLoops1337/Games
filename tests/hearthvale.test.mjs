// Hearthvale simulation suite: headless, drives the shared sim like the server does.
import assert from 'node:assert/strict';
import * as S from '../hearthvale/shared/sim.js';
import { addBots, botStep } from '../hearthvale/shared/bots.js';
import { BUILDINGS, MAX_PLAYERS, GOODS, SELL, ICON, ANIMALS, PROJECT_STAGES, FESTIVAL, MERCHANT, ACHIEVEMENTS, DAILY_GAP_MS, SKILL_XP, QUESTS, TECH } from '../hearthvale/shared/data.js';

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
// the square ring of villages: 16 plots that never overlap, and old circular saves are migrated
{
  const W = S.createWorld(51); for (let i = 0; i < 16; i++) S.addPlayer(W, 'p' + i, 'P' + i);
  const ps = Object.values(W.players); let overlaps = 0;
  for (const a of ps) for (const b of ps) if (a !== b && Math.abs(a.ox - b.ox) < 16 && Math.abs(a.oz - b.oz) < 16) overlaps++;
  ok(overlaps === 0, 'no two village plots overlap');
  const q = ps[3], v0 = q.villagers[0]; const old = { x: v0.x - q.ox, z: v0.z - q.oz }; q.ox = 40; q.oz = 5; v0.x = q.ox + old.x; v0.z = q.oz + old.z;
  const W2 = S.deserialize(S.serialize(W)); const q2 = W2.players[q.id]; const o = S.slotOrigin(q.slot);
  ok(q2.ox === o.ox && q2.oz === o.oz, 'an old save is moved onto the square ring'); ok(Math.abs(q2.villagers[0].x - (o.ox + old.x)) < 1e-6, 'its villagers move with it');
}
// gifting
{
  const W = S.createWorld(41); const A = S.addPlayer(W, 'a', 'A'), B = S.addPlayer(W, 'b', 'B');
  const w0 = B.res.wood; ok(S.command(W, 'a', { op: 'gift', to: 'b', res: 'wood', n: 5 }).ok, 'gift sent'); ok(B.res.wood === w0 + 5, 'gift arrived');
  ok(S.command(W, 'a', { op: 'gift', to: 'b', res: 'wood', n: 5 }).ok === false, 'gifts are rate limited');
  ok(S.command(W, 'a', { op: 'gift', to: 'a', res: 'wood', n: 5 }).ok === false, 'cannot gift yourself'); ok(S.command(W, 'a', { op: 'gift', to: '__proto__', res: 'wood', n: 5 }).ok === false, 'bad target refused');
}
// upgrades
{
  const W = S.createWorld(31); const P = S.addPlayer(W, 'a', 'Ann'); P.level = 6; P.xp = 760; Object.keys(P.res).forEach(k => P.res[k] = 90);
  const h = S.command(W, 'a', { op: 'place', type: 'house', ...spot(W, 'a', 'house') }); run(W, 30); const house = P.buildings.find(b => b.id === h.id);
  const cap0 = S.housingOf(P); ok(S.command(W, 'a', { op: 'upgrade', id: house.id }).ok, 'upgrade starts'); ok(S.command(W, 'a', { op: 'upgrade', id: house.id }).ok === false, 'cannot upgrade twice at once');
  run(W, 60); ok(house.lvl === 2, 'cottage reached level 2'); ok(S.housingOf(P) === cap0 + 1, 'level 2 cottage houses one more');
  const hall = P.buildings[0]; const c0 = S.capOf(P); P.level = 3; ok(S.command(W, 'a', { op: 'upgrade', id: hall.id }).ok, 'hall upgrade'); run(W, 40); ok(S.capOf(P) === c0 + 50, 'hall level 2 stores more');
  ok(S.command(W, 'a', { op: 'upgrade', id: 'x' }).ok === false, 'bad id refused');
}
// neighbour bots build a working economy and help the valley
{
  const W = S.createWorld(21); S.addPlayer(W, 'me', 'Me'); addBots(W, 5);
  for (let i = 0; i < 9000; i++) { S.tick(W, 0.1); botStep(W, 0.1); }
  const bots = Object.values(W.players).filter(p => p.bot);
  ok(bots.every(b => b.buildings.length >= 4), 'every bot built something (' + bots.map(b => b.buildings.length).join(',') + ')');
  ok(bots.some(b => b.level >= 3), 'bots level up (' + bots.map(b => b.level).join(',') + ')');
  ok(W.valley.xp > 0, 'bots finish valley orders');
  ok(bots.every(b => b.villagers.length >= 3), 'bots keep their villagers');
}

// ===== major update: goods, buildings, animals, skills, project, daily, achievements, charm, events =====
const rich = (P) => { for (const q of QUESTS) P.questsDone[q.id] = true; for (const g of GOODS) P.res[g] = 90; P.coins = 5000; P.level = 12; for (const t of Object.keys(TECH)) P.tech[t] = true; };
const instant = (W, id, type, at) => { const P = W.players[id], d = BUILDINGS[type]; const sp = at || S.findSpot(P, d.w, d.h, 1); const b = { id: W.nextId++, type, x: sp.x, y: sp.y, w: d.w, h: d.h, built: true, progress: 1, queue: [], lvl: 1 };
  if (d.field) { b.crop = 0; b.stage = 'empty'; } if (d.animals) { b.an = {}; b.ap = {}; b.stock = {}; b.feed = 0; b.hungry = false; } P.buildings.push(b); return b; };
{
  // new goods and the exact building contract for the art team
  for (const g of ['egg', 'milk', 'wool', 'apple', 'fish', 'cheese', 'jam', 'cloth', 'pie']) ok(GOODS.includes(g) && SELL[g] > 0 && ICON[g], 'good ' + g);
  ok(SELL.egg === 3 && SELL.milk === 4 && SELL.wool === 5 && SELL.apple === 3 && SELL.fish === 4 && SELL.cheese === 9 && SELL.jam === 10 && SELL.cloth === 12 && SELL.pie === 16, 'sell prices as specified');
  const sizes = { coop: [2, 2, 3], barn: [3, 2, 5], dairy: [2, 2, 5], orchard: [3, 3, 4], dock: [3, 2, 6], pantry: [2, 2, 6], weavery: [2, 2, 7], bench: [2, 1], birdbath: [1, 1], scarecrow: [1, 1], picnic: [2, 2], swing: [2, 2], flowercart: [2, 1], pumpkins: [2, 2], hammock: [2, 1], beeskep: [1, 1] };
  for (const [id, [w, h, l]] of Object.entries(sizes)) { const d = BUILDINGS[id]; ok(d && d.w === w && d.h === h && (l === undefined || d.lvl === l), 'building contract ' + id); }
  ok(BUILDINGS.dairy.craft.includes('cheese') && BUILDINGS.pantry.craft.includes('jam') && BUILDINGS.pantry.craft.includes('pie') && BUILDINGS.weavery.craft.includes('cloth'), 'new crafts');
  ok(ACHIEVEMENTS.length >= 30, 'about 30 achievements'); ok(QUESTS.filter(q => q.ch === 2).length >= 15, 'quest chapter 2');
}
{
  // gating by level and research
  const W = S.createWorld(61); const P = S.addPlayer(W, 'a', 'A'); P.res.wood = 99; P.res.planks = 99; P.res.bricks = 99; P.coins = 999;
  ok(S.command(W, 'a', { op: 'place', type: 'coop', x: 0, y: 0 }).err === 'level 3 needed', 'coop needs level 3'); P.level = 3;
  ok(/research/.test(S.command(W, 'a', { op: 'place', type: 'coop', x: 0, y: 0 }).err), 'coop needs Husbandry'); P.tech.husbandry = true;
  ok(S.command(W, 'a', { op: 'place', type: 'coop', ...spot(W, 'a', 'coop') }).ok, 'coop placed once unlocked');
}
{
  // animals: buy, feed, produce, hungry, cap, collect honors storage cap
  const W = S.createWorld(62); const P = S.addPlayer(W, 'a', 'A'); rich(P); P.res.wheat = 40;
  const coop = instant(W, 'a', 'coop');
  ok(S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: 'cow' }).ok === false, 'a cow does not live in a coop');
  ok(S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: '__proto__' }).ok === false, 'junk animal refused'); ok(S.command(W, 'a', { op: 'buyAnimal', id: 'x', kind: 'chicken' }).ok === false, 'junk building refused');
  const c0 = P.coins; ok(S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: 'chicken' }).ok, 'chicken bought'); ok(P.coins === c0 - ANIMALS.chicken.coins, 'paid in coins');
  const w0 = P.res.wheat; ok(S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: 'chicken', with: 'goods' }).ok, 'chicken bought with goods'); ok(P.res.wheat === w0 - ANIMALS.chicken.goods.wheat, 'paid in goods');
  S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: 'chicken' }); S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: 'chicken' });
  ok(S.command(W, 'a', { op: 'buyAnimal', id: coop.id, kind: 'chicken' }).err === 'no room', 'a level 1 coop holds 4 chickens'); ok(S.animalCap(coop) === 4, 'capacity 4');
  const wheat0 = P.res.wheat; run(W, 400); ok(S.stockOf(coop) >= 6, 'chickens produced eggs (' + S.stockOf(coop) + ')'); ok(S.stockOf(coop) <= 8, 'stock capped at 8'); ok(P.res.wheat < wheat0, 'feed taken from storage');
  const snap = S.snapshot(W, 'a'), pub = snap.players[0].b.find(b => b[0] === coop.id); ok(pub[5] === 'ready', 'public stage says ready'); const priv = snap.you.buildings.find(b => b.id === coop.id);
  ok(priv.an.chicken === 4 && priv.stock.egg >= 1 && priv.hungry === false && priv.room === 4, 'private animal fields');
  // collect honors the storage cap
  coop.stock.egg = 8; P.res.egg = S.capOf(P) - 3; ok(S.command(W, 'a', { op: 'assign', k: 'bld', id: coop.id }).ok, 'assign to collect'); run(W, 30);
  ok(P.res.egg === S.capOf(P), 'collect fills storage up to the cap'); ok(coop.stock.egg >= 5, 'the rest stays in the coop (' + coop.stock.egg + ')');
  ok(P.villagers.every(v => !v.task), 'collector is free again');
  // hungry: no wheat, products stop
  const W2 = S.createWorld(63); const Q = S.addPlayer(W2, 'a', 'A'); rich(Q); Q.res.wheat = 0; const c2 = instant(W2, 'a', 'coop'); S.command(W2, 'a', { op: 'buyAnimal', id: c2.id, kind: 'chicken' }); run(W2, 200);
  ok(S.stockOf(c2) === 0 && c2.hungry === true, 'unfed animals pause and the coop is hungry'); ok(S.snapshot(W2, 'a').you.buildings.find(b => b.id === c2.id).hungry === true, 'hungry flag in snapshot');
  Q.res.wheat = 5; run(W2, 20); ok(S.stockOf(c2) >= 1 && !c2.hungry, 'feeding resumes production');
  // barn: cows and sheep, wool and milk, level raises capacity
  const barn = instant(W2, 'a', 'barn'); ok(S.command(W2, 'a', { op: 'buyAnimal', id: barn.id, kind: 'cow' }).ok && S.command(W2, 'a', { op: 'buyAnimal', id: barn.id, kind: 'sheep' }).ok, 'barn takes cow and sheep'); barn.lvl = 3; ok(S.animalCap(barn) === 7, 'level 3 barn holds 7'); Q.res.wheat = 90; run(W2, 400); ok(barn.stock.milk >= 1 && barn.stock.wool >= 1, 'milk and wool');
  const W3 = S.deserialize(S.serialize(W2)); ok(W3.players.a.buildings.find(b => b.id === barn.id).an.cow === 1, 'animals survive a save');
}
{
  // orchard and rain, dock, weather parity
  const ref = (t) => { const k = Math.floor(t / 240); const h = Math.sin(k * 12.9898 + 4.1414) * 43758.5453; return (h - Math.floor(h)) < 0.26 ? 1 : 0; };
  let rainy = 0, same = true; for (let t = 0; t < 240 * 400; t += 37) { if (S.weatherAt(t) !== ref(t)) same = false; rainy += ref(t); }
  ok(same && rainy > 0 && rainy < 400 * 6.5 * 0.5, 'weather formula matches the client (' + rainy + ' rainy samples)');
  let tRain = 0, tDry = 0; for (let t = 0; t < 5000; t += 10) { if (ref(t) && !tRain) tRain = t; if (!ref(t) && !tDry) tDry = t; }
  const grow = (t0) => { const W = S.createWorld(64); const P = S.addPlayer(W, 'a', 'A'); rich(P); const o = instant(W, 'a', 'orchard'); o.stage = 'grow'; W.t = t0; for (let i = 0; i < 100; i++) S.tick(W, 0.1); return o.crop; };
  ok(grow(tRain) > grow(tDry) * 1.9, 'rain doubles crop growth (' + grow(tRain).toFixed(3) + ' vs ' + grow(tDry).toFixed(3) + ')');
  const W = S.createWorld(65); const P = S.addPlayer(W, 'a', 'A'); rich(P); const o = instant(W, 'a', 'orchard'); o.stage = 'ripe'; o.crop = 1; const a0 = P.res.apple; S.command(W, 'a', { op: 'assign', k: 'bld', id: o.id }); run(W, 30);
  ok(P.res.apple >= a0 + 5 && o.stage === 'empty', 'orchard harvest gives apples'); ok(P.stats.apple >= 5, 'apple stat');
  const dock = instant(W, 'a', 'dock'); const f0 = P.res.fish; P.res.fish = 0; S.command(W, 'a', { op: 'assign', k: 'bld', id: dock.id }); run(W, 60);
  ok(P.res.fish >= 5 && P.res.fish <= 30, 'dock fishing yields 1 to 3 per 6 s (' + P.res.fish + ')'); ok(P.villagers.some(v => v.task && v.task.id === dock.id), 'fishing never ends by itself');
  // crafts
  for (const v of P.villagers) S.command(W, 'a', { op: 'recall', vid: v.id });
  const dairy = instant(W, 'a', 'dairy'), pantry = instant(W, 'a', 'pantry'), weavery = instant(W, 'a', 'weavery'); P.res.milk = 4; P.res.apple = 20; P.res.cheese = 0; P.res.jam = 0; P.res.pie = 0; P.res.cloth = 0; P.res.wool = 4; P.res.flour = 4; P.res.egg = 4;
  S.command(W, 'a', { op: 'queue', id: dairy.id, recipe: 'cheese', n: 2 }); S.command(W, 'a', { op: 'queue', id: pantry.id, recipe: 'jam', n: 1 }); S.command(W, 'a', { op: 'queue', id: pantry.id, recipe: 'pie', n: 1 }); S.command(W, 'a', { op: 'queue', id: weavery.id, recipe: 'cloth', n: 2 });
  ok(S.command(W, 'a', { op: 'queue', id: dairy.id, recipe: 'jam', n: 1 }).ok === false, 'dairy cannot make jam'); run(W, 120);
  ok(P.res.cheese === 2 && P.res.jam === 1 && P.res.pie === 1 && P.res.cloth === 2, 'dairy, pantry and weavery craft (' + [P.res.cheese, P.res.jam, P.res.pie, P.res.cloth] + ')');
}
{
  // skills
  const W = S.createWorld(66); const P = S.addPlayer(W, 'a', 'A'); const v = P.villagers[0];
  ok(v.skx.length === 8 && v.skx.every(x => x === 0), 'skills start at zero'); v.skx[0] = SKILL_XP[1] - 3;
  const tree = P.nodes.find(n => n.type === 'tree'); S.command(W, 'a', { op: 'assign', k: 'node', id: tree.id, vid: v.id }); run(W, 40);
  ok(S.skillLevel(v.skx[0]) >= 2, 'woodcutting levelled up'); ok(W.events.some(e => e.t === 'skill' && e.skill === 'woodcutting'), 'skill event');
  const sn = S.snapshot(W, 'a'), yv = sn.you.villagers.find(x => x.id === v.id); ok(yv.skills.length === 8 && yv.skills[0] >= 2 && yv.skx.length === 8, 'skills in snapshot');
  ok(sn.players[0].v[0].length >= 9, 'public villager tuple carries the skill int');
  // speed: a level 5 woodcutter chops faster than a level 1
  const chop = (xp) => { const W = S.createWorld(67); const P = S.addPlayer(W, 'a', 'A'); P.villagers[0].skx[0] = xp; P.res.wood = 0; S.command(W, 'a', { op: 'assign', k: 'valley', id: 'vf_wood', vid: P.villagers[0].id }); run(W, 70); return P.stats.wood || 0; };
  ok(chop(SKILL_XP[4] + 5000) > chop(0), 'skilled villagers work faster (' + chop(SKILL_XP[4] + 5000) + ' vs ' + chop(0) + ')');
  ok(S.command(W, 'a', { op: 'renameVillager', vid: v.id, name: '  Tilly  ' }).ok && v.name === 'Tilly', 'rename villager'); ok(S.command(W, 'a', { op: 'renameVillager', vid: v.id, name: '' }).ok === false, 'empty name refused');
  ok(S.command(W, 'a', { op: 'renameVillager', vid: 'zz', name: 'x' }).ok === false && S.command(W, 'a', { op: 'renameVillager', vid: v.id, name: { a: 1 } }).ok === false, 'junk rename refused');
  ok(S.command(W, 'a', { op: 'renameVillager', vid: v.id, name: 'A'.repeat(40) }).ok && v.name.length === 12, 'name is capped');
}
{
  // the Great Project
  const W = S.createWorld(68); const A = S.addPlayer(W, 'a', 'A'), B = S.addPlayer(W, 'b', 'B'), C = S.addPlayer(W, 'c', 'C'); rich(A); rich(B); const h0 = S.housingOf(A);
  const st = PROJECT_STAGES[0]; ok(W.valley.project.stage === 0, 'project starts at stage 0');
  ok(S.command(W, 'a', { op: 'projectGive', res: 'pie', n: 5 }).err === 'not needed', 'only needed goods');
  ok(S.command(W, 'a', { op: 'projectGive', res: '__proto__', n: 5 }).ok === false && S.command(W, 'a', { op: 'projectGive', res: 'wood', n: NaN }).ok === false, 'junk refused');
  A.res.wood = 400; B.res.stone = 400; B.res.clay = 400; A.res.planks = 400;
  const coinsA = A.coins, coinsB = B.coins, coinsC = C.coins; let done = false;
  S.command(W, 'a', { op: 'projectGive', res: 'wood', n: 999 }); S.command(W, 'a', { op: 'projectGive', res: 'planks', n: 999 });
  ok(A.res.wood === 400 - st.need.wood && A.res.planks === 400 - st.need.planks, 'give is capped at what is needed');
  S.command(W, 'b', { op: 'projectGive', res: 'stone', n: 999 }); S.command(W, 'b', { op: 'projectGive', res: 'clay', n: 999 });
  ok(W.valley.project.stage === 1, 'stage 1 completed'); ok(W.events.some(e => e.t === 'project' && e.stage === 1), 'project event');
  ok(A.coins > coinsA && B.coins > coinsB && C.coins > coinsC, 'every village is paid, contributors most'); ok(A.coins - coinsA > C.coins - coinsC, 'contribution counts');
  ok(A.pst === 1 && C.pst === 1, 'perk reaches every village'); ok(W.valley.project.lb.length === 2, 'leaderboard'); const sn = S.snapshot(W, 'a'); ok(sn.valley.project.top[0].pts > 0 && sn.valley.project.stage === 1 && sn.you.project.total > 0, 'project in snapshot');
  // perks: housing at stage 2, order slot at stage 4, sell bonus at stage 5, gathering at stage 1
  const W2 = S.createWorld(70); const Q = S.addPlayer(W2, 'a', 'A'); const hh = S.housingOf(Q); W2.valley.project.stage = 2; S.tick(W2, 0.1); ok(S.housingOf(Q) === hh + 1, 'stage 2: +1 housing');
  W2.valley.project.stage = 4; for (let i = 0; i < 5; i++) S.tick(W2, 0.1); ok(W2.valley.orders.filter(o => !o.fest).length === S.ordersFor(1, 1), 'stage 4: one more order slot');
  const sellOf = (stage) => { const W = S.createWorld(71); const P = S.addPlayer(W, 'a', 'A'); instant(W, 'a', 'market'); W.valley.project.stage = stage; S.tick(W, 0.1); P.res.pie = 10; P.coins = 0; S.command(W, 'a', { op: 'sell', res: 'pie', n: 10 }); return P.coins; };
  ok(sellOf(5) === Math.round(160 * 1.1) && sellOf(0) === 160, 'stage 5: crafted goods sell for +10%');
  let gain = 0, base = 0; { const W = S.createWorld(72); const P = S.addPlayer(W, 'a', 'A'); for (const st of [0, 1]) { W.valley.project.stage = st; S.tick(W, 0.1); let sum = 0; for (let k = 0; k < 300; k++) { const t = P.nodes.find(n => n.type === 'tree'); t.amount = 12; P.res.wood = 0; const v = P.villagers[0]; v.task = { k: 'node', id: t.id }; const pos = S.tileToWorld(P, t.x + 0.5, t.y + 1.4); v.x = pos.x; v.z = pos.z; v.work = 99; S.tick(W, 0.1); sum += P.res.wood; } if (st) gain = sum; else base = sum; } }
  ok(gain > base * 1.04 && gain < base * 1.2, 'stage 1: about +10% gathering (' + base + ' to ' + gain + ')');
  // finishing every stage ends the project
  const W3 = S.createWorld(73); const P3 = S.addPlayer(W3, 'a', 'A'); for (let s = 0; s < PROJECT_STAGES.length; s++) { for (const g of Object.keys(PROJECT_STAGES[s].need)) { P3.res[g] = 99999; S.command(W3, 'a', { op: 'projectGive', res: g, n: 99999 }); } }
  ok(W3.valley.project.stage === 5, 'all 5 stages done'); ok(S.command(W3, 'a', { op: 'projectGive', res: 'wood', n: 1 }).err === 'project complete', 'nothing more to give'); ok(S.snapshot(W3, 'a').valley.project.name === 'Complete', 'snapshot says complete');
}
{
  // daily reward and streak
  const W = S.createWorld(74); const P = S.addPlayer(W, 'a', 'A'); const H = 3600e3;
  ok(S.command(W, 'a', { op: 'daily' }).err === 'no clock', 'no clock, no reward'); ok(S.snapshot(W, 'a').you.daily.available === false, 'unavailable without a clock');
  S.setNow(W, 1e12); ok(S.snapshot(W, 'a').you.daily.available === true, 'available'); const c0 = P.coins; const r = S.command(W, 'a', { op: 'daily' }); ok(r.ok && r.streak === 1 && P.coins > c0, 'day 1 claimed');
  ok(S.command(W, 'a', { op: 'daily' }).ok === false, 'cannot claim twice'); S.setNow(W, 1e12 + 19 * H); ok(S.command(W, 'a', { op: 'daily' }).ok === false, 'not after 19 hours');
  const d = S.snapshot(W, 'a').you.daily; ok(d.available === false && d.nextInMs === H && d.streak === 1, 'nextInMs counts down');
  S.setNow(W, 1e12 + 20 * H); ok(S.command(W, 'a', { op: 'daily' }).streak === 2, 'streak 2 after 20 hours');
  for (let i = 3; i <= 9; i++) { S.setNow(W, 1e12 + 20 * H * (i - 1) + 1); S.command(W, 'a', { op: 'daily' }); }
  ok(P.daily.streak === 7, 'streak is capped at 7'); ok(P.cosmetics.length >= 1, 'day 7 gives a cosmetic'); run(W, 2); ok(P.ach.a_daily7, 'streak achievement');
  S.setNow(W, 1e12 + 20 * H * 9 + 100 * H); ok(S.snapshot(W, 'a').you.daily.streak === 0, 'a lapsed streak shows 0'); ok(S.command(W, 'a', { op: 'daily' }).streak === 1, 'streak restarts after a long break');
  ok(S.deserialize(S.serialize(W)).players.a.daily.streak === 1, 'daily survives a save');
}
{
  // achievements: unlock once, reward once, titles
  const W = S.createWorld(75); const P = S.addPlayer(W, 'a', 'A'); P.stats.gifted = 25; const c0 = P.coins; run(W, 3);
  ok(P.ach.a_gift1 && P.coins >= c0 + 40, 'achievement unlocks and pays'); const c1 = P.coins; run(W, 5); ok(P.coins === c1, 'only once'); ok(W.events.filter(e => e.t === 'ach' && e.id === 'a_gift1').length === 1, 'one event');
  ok(S.command(W, 'a', { op: 'setTitle', id: 'a_gift2' }).err === 'not unlocked', 'locked title refused'); ok(S.command(W, 'a', { op: 'setTitle', id: 'a_gift1' }).ok === false, 'achievement without a title refused');
  P.stats.gifted = 300; run(W, 3); ok(S.command(W, 'a', { op: 'setTitle', id: 'a_gift2' }).ok, 'title set'); const sn = S.snapshot(W, 'a'); ok(sn.players[0].title === 'Generous', 'public title'); ok(sn.you.ach.a_gift2[1] === 1 && sn.you.ach.a_gift1[0] === 20, 'ach progress in snapshot');
  ok(S.command(W, 'a', { op: 'setTitle', id: '__proto__' }).ok === false, 'junk title refused'); ok(S.command(W, 'a', { op: 'setTitle', id: '' }).ok && S.snapshot(W, 'a').players[0].title === '', 'title cleared');
}
{
  // charm, xp bonus, visitors
  const W = S.createWorld(76); const P = S.addPlayer(W, 'a', 'A'); rich(P); for (let i = 0; i < 4; i++) instant(W, 'a', 'picnic'); instant(W, 'a', 'fountain'); run(W, 2);
  ok(P.charm >= 19, 'charm counts decorations (' + P.charm + ')'); const l1 = P.buildings.find(b => b.type === 'fountain'); l1.lvl = 3; run(W, 2); ok(P.charm > 19, 'upgrades add charm');
  ok(S.xpBonus(W, P) === Math.floor(P.charm / 10) / 100, 'xp bonus follows charm'); P.charm = 9999; ok(S.xpBonus(W, P) === 0.25, 'xp bonus caps at 25%');
  const W2 = S.createWorld(77); const Q = S.addPlayer(W2, 'a', 'A'); rich(Q); for (let i = 0; i < 6; i++) instant(W2, 'a', 'picnic'); run(W2, 400);
  ok(Q.visitor && S.snapshot(W2, 'a').you.visitor.expiresIn > 0, 'a visitor arrives'); const vis = S.snapshot(W2, 'a').you.visitor; ok(vis.want && vis.n >= 1 && vis.price >= Math.round(vis.n * SELL[vis.want] * 1.5), 'visitor pays a premium');
  Q.res[vis.want] = 0; ok(S.command(W2, 'a', { op: 'visitorServe' }).ok === false, 'cannot serve without the goods'); Q.res[vis.want] = vis.n; const c = Q.coins; ok(S.command(W2, 'a', { op: 'visitorServe' }).ok && Q.coins >= c + vis.price && Q.visitor === null, 'visitor served');
  ok(Q.stats.visitors === 1, 'visitor stat'); ok(S.command(W2, 'a', { op: 'visitorServe' }).ok === false, 'no visitor left'); run(W2, 320); ok(Q.visitor !== null, 'the next visitor comes'); run(W2, 160); ok(Q.visitor === null, 'visitors leave when ignored');
  ok(S.snapshot(W2, 'a').players[0].charm === Q.charm, 'public charm');
}
{
  // festival and merchant
  const W = S.createWorld(78); const A = S.addPlayer(W, 'a', 'A'), B = S.addPlayer(W, 'b', 'B'); A.res.wood = 100; B.res.wood = 100; for (const g of GOODS) { A.res[g] = 90; B.res[g] = 90; }
  const nOrders = W.valley.orders.length; ok(S.snapshot(W, 'a').valley.event === null && S.snapshot(W, 'a').valley.merchant === null, 'quiet at the start');
  run(W, MERCHANT.first + 1); const M = W.valley.merchant; ok(M && M.offers.length === 3, 'merchant arrives with 3 offers'); ok(W.events.some(e => e.t === 'merchant' && e.state === 'arrive'), 'merchant event');
  const stock0 = M.offers[0].stock; ok(stock0 >= 3, 'stock shared by the valley');
  for (let k = 0; k < stock0; k++) S.command(W, k % 2 ? 'a' : 'b', { op: 'merchantTrade', i: 0 }); ok(M.offers[0].stock === 0, 'both villages drained the same stock'); ok(S.command(W, 'a', { op: 'merchantTrade', i: 0 }).err === 'sold out', 'sold out');
  ok(S.command(W, 'a', { op: 'merchantTrade', i: 7 }).ok === false && S.command(W, 'a', { op: 'merchantTrade', i: '0' }).ok === false && S.command(W, 'a', { op: 'merchantTrade', i: -1 }).ok === false, 'bad offers refused');
  const o1 = M.offers[1]; const sc = A.res.scrolls; A.res[o1.give.res] = 50; A.res.scrolls = 0; ok(S.command(W, 'a', { op: 'merchantTrade', i: 1 }).ok && A.res.scrolls === o1.get.n, 'scroll trade'); A.res[M.offers[2].give.res] = 0; ok(/need/.test(S.command(W, 'a', { op: 'merchantTrade', i: 2 }).err), 'needs the goods');
  run(W, MERCHANT.len); ok(W.valley.merchant === null, 'merchant leaves'); ok(S.command(W, 'a', { op: 'merchantTrade', i: 0 }).err === 'no merchant', 'nothing to trade');
  // festival
  const W2 = S.createWorld(79); const P = S.addPlayer(W2, 'a', 'A'); run(W2, FESTIVAL.first - 5); ok(W2.valley.event === null, 'no festival yet'); const nb = W2.valley.orders.length;
  run(W2, 10); const ev = W2.valley.event; ok(ev && ev.kind === 'festival' && Math.abs(ev.until - (FESTIVAL.first + FESTIVAL.len)) < 0.5, 'festival starts at ' + FESTIVAL.first + ' and lasts ' + FESTIVAL.len + ' s');
  ok(W2.valley.orders.length === nb + FESTIVAL.orders && W2.valley.orders.filter(o => o.fest).length === 2, 'festival orders'); ok(S.xpBonus(W2, P) >= 0.25, 'festival xp +25%');
  ok(S.placeCost(W2, BUILDINGS.fountain).coins === 20 && S.placeCost(W2, BUILDINGS.house).wood === 15, 'decor half price, houses not'); ok(S.snapshot(W2, 'a').valley.next.festival === FESTIVAL.first + FESTIVAL.every, 'next festival time');
  run(W2, FESTIVAL.len); ok(W2.valley.event === null && S.xpBonus(W2, P) < 0.25, 'festival ends'); ok(W2.events.some(e => e.t === 'festival' && e.state === 'end'), 'festival end event');
  run(W2, FESTIVAL.every - FESTIVAL.len + 10); ok(W2.valley.event !== null, 'festival repeats every ~10 minutes');
  // finishing a festival order does not leave a permanent extra slot
  const fo = W2.valley.orders.find(o => o.fest); fo.done = true; fo.doneAt = W2.t - 100; run(W2, 1); ok(!W2.valley.orders.includes(fo), 'finished festival orders are removed');
}
{
  // neighbours use the new content: buildings, animals, project, merchant, within a simulated hour
  const W = S.createWorld(80); S.addPlayer(W, 'me', 'Me'); addBots(W, 5);
  for (let i = 0; i < 36000; i++) { S.tick(W, 0.1); botStep(W, 0.1); if (i % 100 === 0) S.flushEvents(W); }
  const bots = Object.values(W.players).filter(p => p.bot); const types = new Set(bots.flatMap(b => b.buildings.filter(x => x.built).map(x => x.type)));
  for (const t of ['coop', 'barn', 'orchard', 'dairy', 'dock']) ok(types.has(t), 'a neighbour built a ' + t + ' within an hour');
  ok(bots.some(b => b.buildings.some(x => x.an && S.animalCount(x) > 0)), 'neighbours keep animals'); ok(bots.some(b => (b.stats.egg || 0) + (b.stats.milk || 0) > 0), 'neighbours collect animal goods');
  ok(Object.keys(W.valley.project.total).filter(id => id.startsWith('bot_')).length >= 3, 'neighbours join the Great Project'); ok(bots.some(b => (b.stats.trades || 0) > 0), 'neighbours trade with the merchant');
  ok(bots.every(b => b.villagers.length >= 3 && b.coins >= 0), 'neighbours stay healthy'); ok(JSON.stringify(S.snapshot(W, 'me')).length < 60000, 'snapshot stays small');
}
{
  // an old save (before this update) still loads and plays
  const W = S.createWorld(81); const P = S.addPlayer(W, 'a', 'A'); run(W, 20); const old = JSON.parse(S.serialize(W));
  delete old.valley.project; delete old.valley.event; delete old.valley.merchant; delete old.now; for (const o of old.valley.orders) delete o.at;
  const Po = old.players.a; for (const g of ['egg', 'milk', 'wool', 'apple', 'fish', 'cheese', 'jam', 'cloth', 'pie']) delete Po.res[g];
  for (const k of ['xpf', 'charm', 'pst', 'dT', 'daily', 'ach', 'title', 'cosmetics', 'visitor', 'visitAt']) delete Po[k]; for (const v of Po.villagers) { delete v.skx; delete v.cs; }
  const W2 = S.deserialize(JSON.stringify(old)); const P2 = W2.players.a;
  ok(P2.res.pie === 0 && P2.res.wood === Po.res.wood, 'missing goods default to zero'); ok(W2.valley.project.stage === 0 && W2.valley.event === null, 'valley gets the new state'); ok(P2.villagers[0].skx.length === 8, 'villagers get skills');
  S.addPlayer(W2, 'a', 'A'); run(W2, 30); const sn = S.snapshot(W2, 'a'); ok(sn.you.daily && sn.you.ach && sn.valley.project, 'old save snapshots fine');
  ok(S.command(W2, 'a', { op: 'projectGive', res: 'wood', n: 1 }).ok, 'old save can join the project'); JSON.parse(JSON.stringify(sn));
  const W3 = S.deserialize(S.serialize(W2)); run(W3, 5); ok(true, 'and it round trips again');
}
// client files all exist and the import map is wired
{
  const { readFileSync, existsSync } = await import('node:fs');
  const html = readFileSync(new URL('../hearthvale/index.html', import.meta.url), 'utf8');
  ok(/"three": "\.\/vendor\/three\.module\.min\.js"/.test(html), 'import map points at vendored three');
  for (const f of ['vendor/three.module.min.js', 'js/main.js', 'js/scene.js', 'js/models.js', 'js/net.js', 'style.css', 'art/buildings.js', 'art/characters.js', 'art/environment.js', 'art/critters.js', 'art/props.js', 'art/fx.js', 'js/thumbs.js', 'js/icons.js', 'js/ui/state.js', 'js/ui/fx.js', 'js/ui/frame.js', 'js/ui/hud.js', 'js/ui/build.js', 'js/ui/building.js', 'js/ui/valley.js', 'js/ui/misc.js', 'js/ui/events.js', 'js/ui/tour.js', 'vendor/jsm/utils/BufferGeometryUtils.js']) ok(existsSync(new URL('../hearthvale/' + f, import.meta.url)), f + ' exists');
}
console.log('hearthvale: ' + n + ' checks passed');
