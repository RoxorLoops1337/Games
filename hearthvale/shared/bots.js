// Friendly neighbour villages for solo play. They use the same commands a human would.
import * as S from './sim.js';
import { BUILDINGS, TECH, ANIMALS, PROJECT_STAGES } from './data.js';

const NAMES = ['Willow Creek', 'Maple Hollow', 'Fennel Farm', 'Pebble Bay', 'Thistledown', 'Copper Glen', 'Juniper', 'Larkspur'];
export function addBots(W, n) {
  for (let i = 0; i < n; i++) {
    const id = 'bot_' + i; if (W.players[id]) { W.players[id].bot = true; continue; }
    const P = S.addPlayer(W, id, NAMES[i % NAMES.length]); if (!P) return; P.bot = true; P.online = true;
    P.res.wood = 80; P.res.clay = 40; P.res.stone = 30; P.coins = 80;
  }
}
const wantList = ['house', 'farm', 'kitchen', 'house', 'sawmill', 'kiln', 'storehouse', 'study', 'flowers', 'mill', 'orchard', 'coop', 'house', 'barn', 'dairy', 'bakery', 'market', 'dock', 'pantry', 'weavery',
  'scarecrow', 'bench', 'fountain', 'birdbath', 'flowercart', 'picnic', 'banner', 'lantern', 'swing', 'pumpkins', 'beeskep', 'hammock', 'house', 'flowers'];
// the techs a neighbour studies, in order
const techOrder = ['milling', 'husbandry', 'trade', 'angling', 'preserving', 'weaving', 'swift', 'sturdy', 'keen', 'hearty'];
// [building, recipe, when to queue it]
const crafts = [
  ['kitchen', 'soup', p => p.res.wheat >= 4 && p.res.soup < 12],
  ['sawmill', 'planks', p => p.res.wood >= 14 && p.res.planks < 40],
  ['kiln', 'bricks', p => p.res.clay >= 14 && p.res.bricks < 30],
  ['study', 'scrolls', p => p.res.planks >= 3 && p.res.clay >= 3 && p.res.scrolls < 14],
  ['mill', 'flour', p => p.res.wheat >= 6 && p.res.flour < 10],
  ['bakery', 'bread', p => p.res.flour >= 4 && p.res.bread < 10],
  ['dairy', 'cheese', p => p.res.milk >= 4 && p.res.cheese < 10],
  ['pantry', 'jam', p => p.res.apple >= 6 && p.res.jam < 10],
  ['pantry', 'pie', p => p.res.apple >= 4 && p.res.flour >= 2 && p.res.egg >= 2 && p.res.pie < 6],
  ['weavery', 'cloth', p => p.res.wool >= 4 && p.res.cloth < 10],
];
const RESERVE = { wood: 30, clay: 30, stone: 30, wheat: 20, planks: 30, bricks: 20, soup: 8, flour: 8, bread: 6 };
const SELLABLE = ['egg', 'milk', 'wool', 'apple', 'fish'];
export function botStep(W, dt) {
  for (const P of Object.values(W.players)) {
    if (!P.bot) continue;
    P.online = true;
    P.botT = (P.botT || 0) - dt; if (P.botT > 0) continue; P.botT = 8 + W.rnd() * 8;
    const have = (t) => P.buildings.filter(b => b.type === t).length;
    const built = (t) => P.buildings.find(b => b.type === t && b.built);
    // build the next thing on the wish list that fits
    for (let i = 0; i < wantList.length; i++) {
      const t = wantList[i], d = BUILDINGS[t]; let want = 0; for (let j = 0; j <= i; j++) if (wantList[j] === t) want++;
      if (have(t) >= want || P.level < d.lvl || (d.tech && !P.tech[d.tech]) || P.buildings.some(b => !b.built)) continue;
      const spot = S.findSpot(P, d.w, d.h, d.decor ? 0 : 1); if (spot) { S.command(W, P.id, { op: 'place', type: t, ...spot }); }
      break;
    }
    // study: learn the next tech when there are enough scrolls
    const study = built('study');
    if (study && !study.research) { const t = techOrder.find(x => !P.tech[x]); if (t && P.res.scrolls >= TECH[t].scrolls) S.command(W, P.id, { op: 'research', id: study.id, tech: t }); }
    // workshops
    for (const [bt, recipe, when] of crafts) { const b = built(bt); if (b && !b.queue.length && !b.research && when(P)) S.command(W, P.id, { op: 'queue', id: b.id, recipe, n: 2 }); }
    // make sure somebody works on every job that needs a crew (research, crafting, building, upgrades)
    for (const b of P.buildings) {
      if (!(b.research || b.queue.length || !b.built || b.up)) continue;
      if (P.villagers.some(v => v.task && v.task.k === 'bld' && v.task.id === b.id)) continue;
      const who = P.villagers.find(v => !v.task) || P.villagers.find(v => v.task && v.task.k !== 'bld'); if (who) S.command(W, P.id, { op: 'assign', k: 'bld', id: b.id, vid: who.id });
    }
    // animals
    for (const b of P.buildings) {
      if (!b.an || !b.built || S.animalCount(b) >= S.animalCap(b)) continue;
      const kind = b.type === 'coop' ? 'chicken' : (b.an.cow || 0) <= (b.an.sheep || 0) ? 'cow' : 'sheep';
      S.command(W, P.id, { op: 'buyAnimal', id: b.id, kind, with: P.coins >= ANIMALS[kind].coins + 30 ? 'coins' : 'goods' });
    }
    // idle villagers: feed the economy
    let fishing = 0; for (const v of P.villagers) if (v.task && v.task.k === 'bld') { const b = P.buildings.find(x => x.id === v.task.id); if (b && b.type === 'dock') fishing++; }
    for (const v of P.villagers) {
      if (v.task) continue;
      const farm = P.buildings.find(b => b.built && (b.type === 'farm' || b.type === 'orchard') && b.stage !== 'grow');
      const pens = P.buildings.find(b => b.an && b.built && S.stockOf(b) >= 3);
      const dock = built('dock');
      const r = W.rnd();
      if (pens && r < 0.6) { S.command(W, P.id, { op: 'assign', k: 'bld', id: pens.id, vid: v.id }); continue; }
      if (farm && r < 0.3) { S.command(W, P.id, { op: 'assign', k: 'bld', id: farm.id, vid: v.id }); continue; }
      if (dock && !fishing && r < 0.5 && P.res.fish < 20) { S.command(W, P.id, { op: 'assign', k: 'bld', id: dock.id, vid: v.id }); fishing++; continue; }
      if (P.res.wheat < 8 && r < 0.6) { S.command(W, P.id, { op: 'assign', k: 'valley', id: 'vf_wheat', vid: v.id }); continue; }
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
    // ... and with the Great Project
    const pr = W.valley.project;
    if (pr.stage < PROJECT_STAGES.length) for (const g of Object.keys(PROJECT_STAGES[pr.stage].need)) {
      const spare = P.res[g] - (RESERVE[g] || 4); if (spare > 0 && W.rnd() < 0.2 / (1 + pr.stage)) S.command(W, P.id, { op: 'projectGive', res: g, n: Math.min(spare, 5) });
    }
    // sell extra farm goods, and pay a visit to the travelling merchant
    if (built('market')) for (const g of SELLABLE) if (P.res[g] > 20) S.command(W, P.id, { op: 'sell', res: g, n: P.res[g] - 12 });
    const M = W.valley.merchant;
    if (M && P.botM !== M.until && W.rnd() < 0.3) {
      P.botM = M.until;
      M.offers.forEach((o, i) => { if (o.stock > 0 && P.res[o.give.res] >= o.give.n + (RESERVE[o.give.res] || 4)) S.command(W, P.id, { op: 'merchantTrade', i }); });
    }
    if (P.coins < 200) P.coins += 1;   // neighbours trade among themselves
    if (P.res.soup < 3) P.res.soup += 1;  // never let a neighbour starve
  }
}
