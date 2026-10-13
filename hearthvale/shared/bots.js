// Friendly neighbour villages for solo play. They use the same commands a human would.
import * as S from './sim.js';
import { BUILDINGS, NODE_TYPES } from './data.js';

const NAMES = ['Willow Creek', 'Maple Hollow', 'Fennel Farm', 'Pebble Bay', 'Thistledown', 'Copper Glen', 'Juniper', 'Larkspur'];
export function addBots(W, n) {
  for (let i = 0; i < n; i++) {
    const id = 'bot_' + i; if (W.players[id]) { W.players[id].bot = true; continue; }
    const P = S.addPlayer(W, id, NAMES[i % NAMES.length]); if (!P) return; P.bot = true; P.online = true;
    P.res.wood = 80; P.res.clay = 40; P.res.stone = 30; P.coins = 80;
  }
}
const wantList = ['house', 'farm', 'kitchen', 'house', 'sawmill', 'kiln', 'storehouse', 'house', 'farm', 'study', 'flowers', 'flowers', 'fountain', 'banner', 'lantern'];
export function botStep(W, dt) {
  for (const P of Object.values(W.players)) {
    if (!P.bot) continue;
    P.online = true;
    P.botT = (P.botT || 0) - dt; if (P.botT > 0) continue; P.botT = 4 + W.rnd() * 4;
    const have = (t) => P.buildings.filter(b => b.type === t).length;
    // build the next thing on the wish list that fits
    for (const t of wantList) {
      const d = BUILDINGS[t]; const want = wantList.slice(0, wantList.indexOf(t) + 1).filter(x => x === t).length;
      if (have(t) >= want || P.level < d.lvl || P.buildings.some(b => !b.built)) continue;
      const spot = S.findSpot(P, d.w, d.h, 1); if (spot) { S.command(W, P.id, { op: 'place', type: t, ...spot }); }
      break;
    }
    // idle villagers: feed the economy
    for (const v of P.villagers) {
      if (v.task) continue;
      const kitchens = P.buildings.filter(b => b.type === 'kitchen' && b.built);
      const farm = P.buildings.find(b => b.type === 'farm' && b.built && b.stage !== 'grow');
      const r = W.rnd();
      if (farm && r < 0.3) { S.command(W, P.id, { op: 'assign', k: 'bld', id: farm.id, vid: v.id }); continue; }
      if (kitchens[0] && P.res.wheat >= 4 && P.res.soup < 12 && r < 0.55 && !kitchens[0].queue.length) { S.command(W, P.id, { op: 'queue', id: kitchens[0].id, recipe: 'soup', n: 2 }); continue; }
      const lowest = ['wood', 'clay', 'stone'].sort((a, b) => P.res[a] - P.res[b])[0];
      const type = { wood: 'tree', clay: 'clay', stone: 'rock' }[lowest];
      const node = P.nodes.find(n => n.type === type && n.amount > 0);
      if (node) S.command(W, P.id, { op: 'assign', k: 'node', id: node.id, vid: v.id });
    }
    if (P.villagers.length < S.housingOf(P) && P.res.soup >= S.hireCost(P).soup + 2) S.command(W, P.id, { op: 'hire' });
    // help the valley with a surplus
    for (const o of W.valley.orders) {
      if (o.done) continue;
      for (const g of Object.keys(o.need)) { const spare = P.res[g] - 12; if (spare > 0 && o.got[g] < o.need[g] && W.rnd() < 0.35) S.command(W, P.id, { op: 'contribute', id: o.id, res: g, n: Math.min(spare, 6) }); }
    }
    if (P.buildings.some(b => b.type === 'farm' && b.built) === false && P.res.soup < 3) P.res.soup += 1;  // never let a neighbour starve
  }
}
