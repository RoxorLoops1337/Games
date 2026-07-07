// Frietkot Story — logic tests for the Kairosoft-style manager.
import { loadFT } from './frietkot_tycoon_lib.mjs';

const FS = loadFT();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } };

// ---- surface + data ----
ok(FS && typeof FS.freshGame === 'function', 'FS surface exposed');
ok(FS.OBJECTS.length >= 6 && FS.RESEARCH.length >= 4 && FS.CUSTTYPES.length >= 4, 'data tables present');
ok(FS.objDef('friteuse').kind === 'fryer', 'objDef lookup');
ok(FS.objDef('nope') === null, 'objDef miss = null');
ok(FS.resDef('bicky').kind === 'snack', 'resDef lookup');

// ---- fresh game ----
const G = FS.freshGame();
ok(G.money === 400 && G.faam === 0 && G.week === 1, 'starts with €400, 0 faam, week 1');
ok(Array.isArray(G.objs) && FS.countKind(G.objs, 'fryer') === 1 && FS.countKind(G.objs, 'counter') === 2, 'starts with a fryer and two toogs');
ok(G.staff === 0 && Object.keys(G.research).length === 0, 'no staff / research yet');

// ---- adjacency + combos ----
ok(FS.adjacent({ gx: 1, gy: 0 }, { gx: 2, gy: 0 }) === true, 'orthogonal adjacency');
ok(FS.adjacent({ gx: 1, gy: 0 }, { gx: 2, gy: 1 }) === false, 'diagonal is not adjacent');
{
  const objs = [{ id: 'friteuse', gx: 1, gy: 0 }, { id: 'sausbar', gx: 2, gy: 0 }];
  const cb = FS.detectCombos(objs);
  ok(cb.length === 1 && cb[0].name === 'Vol-au-saus' && cb[0].valueMul > 1, 'sausbar next to fryer = combo');
  const objs2 = [{ id: 'friteuse', gx: 1, gy: 0 }, { id: 'sausbar', gx: 4, gy: 4 }];
  ok(FS.detectCombos(objs2).length === 0, 'combo needs adjacency');
}

// ---- appeal drives spawn rate ----
const a0 = FS.computeAppeal(G);
ok(a0 > 0, 'appeal positive from starting furniture');
const G2 = FS.freshGame(); G2.objs.push({ id: 'neon', gx: 4, gy: 0 });
ok(FS.computeAppeal(G2) > a0, 'adding a neon sign raises appeal');
const G3 = FS.freshGame(); G3.research.reclame = true;
ok(FS.computeAppeal(G3) > a0, 'reclame research raises appeal');
ok(FS.spawnInterval(50) < FS.spawnInterval(5), 'more appeal = customers arrive faster');
ok(FS.spawnInterval(9999) >= FS.BAL.spawnMin, 'spawn interval is floored');

// ---- throughput / service ----
ok(Math.abs(FS.throughput(G) - 1) < 1e-9, 'base throughput = 1 (one fryer, no staff)');
const Gf = FS.freshGame(); Gf.objs.push({ id: 'friteuse', gx: 2, gy: 0 });
ok(FS.throughput(Gf) > FS.throughput(G), 'a second fryer raises throughput');
const Gs = FS.freshGame(); Gs.staff = 2;
ok(FS.throughput(Gs) > FS.throughput(G), 'staff raise throughput');
const Gr = FS.freshGame(); Gr.research.snelbak = true;
ok(FS.throughput(Gr) > FS.throughput(G), 'snelbak research raises throughput');
ok(FS.serviceTime(Gf) < FS.serviceTime(G), 'higher throughput = faster service');

// ---- order value ----
const local = FS.CUSTTYPES.find(t => t.id === 'local');
const base = FS.orderValue(G, { fav: null, spend: 1 }, 1);
ok(base === FS.BAL.frietPrice, 'plain order with no research = fries price');
const Gsauce = FS.freshGame(); Gsauce.research.andalouse = true;
ok(FS.orderValue(Gsauce, { fav: null, spend: 1 }, 1) > base, 'unlocked sauce raises order value');
const worker = { fav: 'bicky', spend: 1.2 };
const Gb = FS.freshGame(); Gb.research.bicky = true;
ok(FS.orderValue(Gb, worker, 1) > base, 'worker who wants an unlocked bicky pays more');
ok(FS.orderValue(G, { fav: null, spend: 1 }, 1.5) > base, 'a combo multiplier raises the ticket');

// ---- customer type roll respects decor pulls ----
{
  const plain = FS.freshGame();
  const withJuke = FS.freshGame();
  for (let i = 0; i < 6; i++) withJuke.objs.push({ id: 'jukebox', gx: i % 7, gy: 3 });
  let teenPlain = 0, teenJuke = 0;
  for (let i = 0; i < 500; i++) {
    if (FS.rollType(plain).id === 'teen') teenPlain++;
    if (FS.rollType(withJuke).id === 'teen') teenJuke++;
  }
  ok(teenJuke > teenPlain, 'jukeboxes pull more teens');
  ok(FS.rollType(plain, 0).id === FS.CUSTTYPES[0].id, 'rollType is deterministic with a supplied roll');
}

// ---- ranks + staff cost ----
ok(FS.rankFor(0) === FS.RANKS[0][1], 'start rank');
ok(FS.rankFor(9999) === FS.RANKS[FS.RANKS.length - 1][1], 'top rank at high served count');
ok(FS.rankFor(30) !== FS.rankFor(0), 'rank climbs with customers served');
ok(FS.staffCost(1) > FS.staffCost(0), 'each hire costs more');
ok(FS.canAfford(G, 400) && !FS.canAfford(G, 401), 'canAfford checks money');

// ---- merge mechanic ----
ok(FS.power(1) === 1, 'level 1 power = 1');
ok(Math.abs(FS.power(2) - 1.5) < 1e-9, 'level 2 power = 1.5x');
ok(Math.abs(FS.power(3) - 2.25) < 1e-9, 'level 3 = 1.5^2');
ok(FS.power(2) < 2 * FS.power(1), 'a merged pair is weaker than the two it replaced (space tradeoff)');
ok(Math.abs(FS.power(3) / (2 * FS.power(2)) - 0.75) < 1e-9, 'merged is always 75% of the two inputs');
ok(FS.canMerge({ id: 'toog', lvl: 1 }, { id: 'toog', lvl: 1 }) === true, 'same id+level can merge');
ok(FS.canMerge({ id: 'toog', lvl: 1 }, { id: 'toog', lvl: 2 }) === false, 'different level cannot merge');
ok(FS.canMerge({ id: 'toog', lvl: 1 }, { id: 'friteuse', lvl: 1 }) === false, 'different type cannot merge');
{
  const a = { id: 'toog', lvl: 1 };
  ok(FS.canMerge(a, a) === false, 'cannot merge an object with itself');
}
{
  const g = FS.freshGame(); const a0 = FS.computeAppeal(g);
  g.objs[3].lvl = 2;  // level up the plant
  ok(FS.computeAppeal(g) > a0, 'a higher-level object contributes more appeal');
  const gf = FS.freshGame(); const t0 = FS.throughput(gf); gf.objs[0].lvl = 3; // fryer to level 3
  ok(FS.throughput(gf) > t0, 'a higher-level fryer raises throughput');
  ok(Math.abs(FS.kindPower(gf.objs, 'fryer') - FS.power(3)) < 1e-9, 'kindPower sums level powers');
  const gc = FS.freshGame();
  ok(FS.serviceTime(gc, 2) < FS.serviceTime(gc, 1), 'a leveled toog serves faster');
}

// ---- hook layer: rank progress + weekly goals + regulars ----
ok(FS.rankProgress(0).next === FS.RANKS[1][0], 'rank progress points at the next threshold');
ok(FS.rankProgress(0).frac >= 0 && FS.rankProgress(0).frac < 1, 'not maxed at the start');
ok(FS.rankProgress(99999).next === null, 'top rank has no next target');
{ const p = FS.rankProgress(6); ok(p.frac > 0 && p.frac < 1, 'partial progress mid-rank'); }
ok(FS.weekGoal(1) < FS.weekGoal(10), 'weekly serve-goal scales up over weeks');
ok(FS.weekGoal(1) > 0, 'weekly goal is a positive target');
{ const g = FS.freshGame(); ok(g.regulars === 0 && g.weekServed === 0 && g.goalTarget > 0, 'fresh game carries hook-layer fields'); }

// ---- dish development (ingredient combos) ----
ok(FS.INGREDIENTS.length >= 6, 'ingredients present');
ok(FS.ingDef('ajuin').good.includes('friet'), 'ajuin pairs well with friet');
ok(FS.dishesUnlocked(G).includes('friet'), 'friet is always developable');
{
  const gu = FS.freshGame(); gu.research.frikandel = true; gu.dish.frikandel = { rank: 1 };
  ok(FS.dishesUnlocked(gu).includes('frikandel'), 'researched snack becomes developable');
}
// compatibility scoring
ok(FS.compatScore('friet', ['ajuin']) === 2, 'good ingredient = +2');
ok(FS.compatScore('friet', ['brood']) === -1, 'bad ingredient = -1');
ok(FS.compatScore('friet', ['ajuin', 'ei']) === 4, 'two good ingredients stack');
ok(FS.compatScore('friet', ['ajuin', 'brood']) === 1, 'good + bad mix');
// rank gain from compatibility
ok(FS.devGain(4) === 3, 'great combo = +3 rank (capped)');
ok(FS.devGain(0) === 1, 'neutral still nudges +1');
ok(FS.devGain(-2) === 0, 'a clashing combo flops (0)');
// price + cost scale with rank
ok(FS.dishPrice(30, 2) > FS.dishPrice(30, 1), 'higher-rank dish is pricier');
ok(FS.dishRank(G, 'friet') === 1, 'dishes start at rank 1');
ok(FS.developCost(3) > FS.developCost(1), 'developing a higher-rank dish costs more');
// ranking a dish up raises what customers pay
{
  const g1 = FS.freshGame(); const g2 = FS.freshGame(); g2.dish.friet.rank = 4;
  ok(FS.orderValue(g2, { fav: null, spend: 1 }, 1) > FS.orderValue(g1, { fav: null, spend: 1 }, 1), 'a higher-rank friet earns more per order');
}

// ---- escalating purchase prices ----
{
  const g = FS.freshGame();
  ok(g.bought && Object.keys(g.bought).length === 0, 'fresh game has no purchases yet');
  ok(FS.buyCost(g, 'toog') === FS.objDef('toog').cost, 'first buy = base cost');
  g.bought.toog = 1;
  ok(FS.buyCost(g, 'toog') === Math.round(FS.objDef('toog').cost * FS.BUY_MULT), '2nd buy scaled by BUY_MULT');
  g.bought.toog = 4;
  ok(FS.buyCost(g, 'toog') > FS.objDef('toog').cost * 10, '5th toog is much pricier');
  ok(FS.BUY_MULT >= 1.8, 'purchases climb steeply');
  const g2 = FS.freshGame(); g2.bought.friteuse = 2;
  ok(FS.buyCost(g2, 'friteuse') > FS.buyCost(FS.freshGame(), 'friteuse'), 'each item escalates independently');
}

// ---- floors ----
{
  ok(FS.FLOORS.length === 15, '15 floor textures');
  ok(FS.floorDef('planken').cost === 0, 'planken is the free starter floor');
  ok(FS.floorDef('marmer').appeal >= FS.floorDef('planken').appeal, 'marmer is at least as appealing as planken');
  ok(FS.floorDef('nope') === null, 'floorDef miss = null');
  const g = FS.freshGame();
  ok(g.floor === 'planken' && g.floorsOwned.planken === true, 'fresh game starts on the free planken floor');
  ok(FS.floorAppeal(g) === 0, 'the starter floor adds no appeal');
  const a0 = FS.computeAppeal(g);
  g.floor = 'marmer';
  ok(FS.floorAppeal(g) === FS.floorDef('marmer').appeal, 'floorAppeal reflects the active floor');
  ok(FS.computeAppeal(g) > a0, 'a fancier floor raises overall appeal');
}

// ---- extended toog merge ladder (75 Rudy Friet counter tiers) ----
{
  ok(FS.MAX_TOOG === 75, 'toog art ladder runs to 75 tiers');
  ok(FS.power(FS.MAX_TOOG) > FS.power(25), 'a tier-75 toog is stronger than a tier-25 one');
  // merging keeps climbing past the old cap; art clamps but level keeps rising
  ok(FS.canMerge({ id: 'toog', lvl: 40 }, { id: 'toog', lvl: 40 }) === true, 'high-tier toogs still merge');
}

// ---- fryer (friteuse) merge ladder: 60 Rudy Fryers tiers ----
{
  ok(FS.MAX_FRYER === 60, 'fryer art ladder runs to 60 tiers');
  // a dragged friteuse merges onto a matching friteuse just like a toog
  const g = FS.freshGame();
  const f = g.objs.find(o => o.id === 'friteuse');
  g.objs.push({ id: 'friteuse', gx: 3, gy: 2, lvl: 1 });
  const other = g.objs.filter(o => o.id === 'friteuse')[1];
  ok(FS.applyDrop(g, f, other.gx, other.gy) === 'merge', 'a friteuse drops onto a matching friteuse to merge');
  ok(other.lvl === 2, 'merged friteuse levels up (its art advances a tier)');
}

// ---- zithoek (seating) merge ladder: 40 booth tiers ----
{
  ok(FS.MAX_SEAT === 40, 'seat/zithoek art ladder runs to 40 tiers');
  ok(FS.objDef('staantafel').kind === 'leaner', 'the seating object drives the booth ladder');
  const g = FS.freshGame();
  const s = g.objs.find(o => o.id === 'staantafel');
  const other = g.objs.filter(o => o.id === 'staantafel')[1];
  ok(FS.applyDrop(g, s, other.gx, other.gy) === 'merge', 'a zithoek drops onto a matching zithoek to merge');
  ok(other.lvl === 2, 'merged zithoek levels up (its booth art advances a tier)');
}

// ---- drag & drop: move to an empty tile, drop on a match to merge ----
{
  // drop a toog onto a matching toog -> merge (level up, one fewer object)
  const g = FS.freshGame();
  const a = g.objs.find(o => o.id === 'toog');
  const b = g.objs.filter(o => o.id === 'toog')[1];
  const before = g.objs.length;
  const res = FS.applyDrop(g, a, b.gx, b.gy);
  ok(res === 'merge', 'dropping a toog on a matching toog merges');
  ok(b.lvl === 2 && g.objs.indexOf(a) === -1 && g.objs.length === before - 1, 'merge levels the target and removes the dragged one');
}
{
  // drag to an empty tile -> move
  const g = FS.freshGame();
  const a = g.objs.find(o => o.id === 'toog');
  const res = FS.applyDrop(g, a, 1, 2);
  ok(res === 'move' && a.gx === 1 && a.gy === 2, 'dragging to a free tile moves the object');
}
{
  // drop on a non-matching object -> reject (no change)
  const g = FS.freshGame();
  const toog = g.objs.find(o => o.id === 'toog');
  const fry = g.objs.find(o => o.id === 'friteuse');
  const res = FS.applyDrop(g, toog, fry.gx, fry.gy);
  ok(res === 'reject', 'dropping on a different kind is rejected');
  ok(toog.gx !== fry.gx || toog.gy !== fry.gy, 'a rejected drop does not move onto the occupant');
}
{
  // cannot drop onto the door tile
  const g = FS.freshGame();
  const a = g.objs.find(o => o.id === 'toog');
  const door = { gx: (FS.BAL.GW >> 1), gy: FS.BAL.GH - 1 };
  const res = FS.applyDrop(g, a, door.gx, door.gy);
  ok(res === 'reject', 'the door tile rejects drops');
}
{
  // different-level toogs do not merge
  const g = FS.freshGame();
  const a = g.objs.find(o => o.id === 'toog');
  const b = g.objs.filter(o => o.id === 'toog')[1];
  b.lvl = 2;
  ok(FS.applyDrop(g, a, b.gx, b.gy) === 'reject', 'a level-1 toog cannot merge onto a level-2 toog');
}

// ---- relaxed pacing (calmer, more enjoyable tempo) ----
{
  ok(FS.BAL.spawnBase >= 4 && FS.BAL.spawnMin >= 1, 'customers arrive at a relaxed pace, even when busy');
  ok(FS.BAL.weekLen >= 30, 'weeks breathe (longer week clock)');
  ok(FS.BAL.eatTime >= 4, 'customers linger and eat longer');
  // even a very popular shop never floods the door
  ok(FS.spawnInterval(9999) >= 1, 'peak spawn rate is capped to a leisurely minimum');
  ok(FS.spawnInterval(3) > FS.spawnInterval(60), 'appeal still speeds arrivals, just gently');
}

// ---- expandable shop (starts small & cosy, grows on unlock) ----
{
  ok(FS.BAL.GW === 6 && FS.BAL.GH === 4, 'the shop starts at a cosy, zoomed-in 6×4');
  ok(FS.GRID_LEVELS[0].gw === 6 && FS.GRID_LEVELS[0].gh === 4, 'first grid level is 6×4');
  const g = FS.freshGame();
  ok(g.expand === 0, 'fresh game starts un-expanded');
  ok(FS.shopSize(g).gw === 6 && FS.shopSize(g).gh === 4, 'shopSize reflects the expand level');
  g.expand = 1;
  ok(FS.shopSize(g).gw >= 7, 'expanding grows the grid');
  ok(FS.expandCost(1) > FS.expandCost(0), 'each expansion costs more than the last');
  ok(FS.maxExpand() === FS.GRID_LEVELS.length - 1, 'maxExpand points at the last grid level');
  // every level only grows (never shrinks) so placed furniture stays in-bounds
  for (let i = 1; i < FS.GRID_LEVELS.length; i++) {
    ok(FS.GRID_LEVELS[i].gw >= FS.GRID_LEVELS[i-1].gw && FS.GRID_LEVELS[i].gh >= FS.GRID_LEVELS[i-1].gh, `level ${i} is at least as big as level ${i-1}`);
  }
  // starting furniture fits inside the 6×4 grid
  ok(g.objs.every(o => o.gx < 6 && o.gy < 4), 'starting furniture fits the 6×4 shop');
}

// ---- kitchen: clearer recipe-inventing ----
{
  ok(FS.INGREDIENTS.length >= 10, 'a richer pantry of ingredients to invent with');
  // affinity mirrors compat for a single ingredient (drives the 👍/👎 badges)
  ok(FS.affinity('ajuin', 'friet') === 2, 'a loved ingredient shows positive affinity');
  ok(FS.affinity('brood', 'friet') === -1, 'a clashing ingredient shows negative affinity');
  ok(FS.affinity('ei', 'frikandel') <= 0, 'a neutral/clashing ingredient is not positive');
  // signature titles climb as the dish taste-rank grows (the "creation" feel)
  ok(FS.sigTitle(1) !== FS.sigTitle(5), 'a higher-rank dish earns a fancier title');
  ok(typeof FS.sigTitle(99) === 'string', 'title is capped, not undefined, at very high rank');
  ok(FS.dishEmoji('friet') === '🍟' && FS.dishName('friet') === 'Friet', 'dish presentation helpers');
}

// ---- VIP critic rating ----
{
  const g = FS.freshGame();
  const r = FS.criticRating(g);
  ok(r.stars >= 1 && r.stars <= 5, 'critic gives a 1–5 star rating');
  ok(r.faam > 0 && r.cash > 0, 'a critic visit rewards Faam and money');
  // a great frituur scores better than a bare one
  const g2 = FS.freshGame(); g2.dish.friet.rank = 6; g2.objs.push({ id: 'neon', gx: 0, gy: 1, lvl: 3 }); g2.research.reclame = true;
  ok(FS.criticRating(g2).stars >= FS.criticRating(g).stars, 'a fancier shop earns at least as many stars');
  ok(FS.criticRating(g2).stars >= 4, 'a high-rank, high-appeal shop pleases the critic');
}

// ---- seasons ----
{
  ok(FS.SEASONS.length === 4, 'four seasons');
  ok(FS.seasonFor(1).id === 'lente', 'the year starts in spring');
  ok(FS.seasonFor(4).id !== FS.seasonFor(1).id, 'the season changes after a few weeks');
  ok(FS.seasonFor(1).id === FS.seasonFor(13).id, 'seasons cycle back after a full year');
  const summer = FS.SEASONS.find(s => s.id === 'zomer'), winter = FS.SEASONS.find(s => s.id === 'winter');
  ok(summer.traffic > 1 && winter.traffic < 1, 'summer is busier, winter quieter');
  ok(winter.spend > 1, 'winter comfort-food splurge raises spend');
}

// ---- staff crew with stats + training ----
{
  const g = FS.freshGame();
  ok(Array.isArray(g.crew) && g.crew.length === 0, 'fresh game starts with no crew');
  // a flat legacy staff count still works via fallback
  const legacy = FS.freshGame(); legacy.crew = []; legacy.staff = 2;
  ok(FS.staffSpeed(legacy) === 2, 'a legacy flat staff count falls back to speed');
  // a hired, level-1 crew member contributes like one old staff
  const g2 = FS.freshGame(); g2.crew = [{ name: 'Rudy', spdLv: 1, sklLv: 1 }];
  ok(Math.abs(FS.staffSpeed(g2) - 1) < 1e-9, 'a level-1 friturist contributes 1.0 speed');
  ok(FS.throughput(g2) > FS.throughput(g), 'hiring raises throughput');
  // training speed raises throughput, training skill raises order value
  const g3 = FS.freshGame(); g3.crew = [{ name: 'Fien', spdLv: 3, sklLv: 1 }];
  ok(FS.staffSpeed(g3) > FS.staffSpeed(g2), 'a trained-speed friturist is faster');
  const g4 = FS.freshGame(); g4.crew = [{ name: 'Jos', spdLv: 1, sklLv: 4 }];
  ok(FS.serviceBonus(g4) > 1, 'trained skill raises the service bonus');
  ok(FS.orderValue(g4, { fav: null, spend: 1 }, 1) > FS.orderValue(g2, { fav: null, spend: 1 }, 1), 'a skilled crew earns bigger tickets');
  ok(FS.trainCost(2) > FS.trainCost(1), 'each training level costs more');
}

console.log(`frietkot_story: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
