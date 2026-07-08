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
ok(base === Math.round(FS.menuAvg(G)), 'plain order = the menu-average friet ticket');
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
  ok(FS.buyCost(g, 'toog') > FS.objDef('toog').cost * 4, '5th toog is much pricier');
  ok(FS.BUY_MULT >= 1.4, 'purchases still climb');
  // the escalation softens past the cap so high tiers stay reachable
  const gEarly = FS.freshGame(); gEarly.bought.toog = FS.BUY_SOFT;
  const gLate = FS.freshGame(); gLate.bought.toog = FS.BUY_SOFT + 4;
  const early = FS.buyCost(gEarly, 'toog'), late = FS.buyCost(gLate, 'toog');
  ok(late > early, 'buying still gets pricier past the soft cap');
  ok(late < early * Math.pow(FS.BUY_MULT, 4), 'but softer than pure exponential (so merges stay affordable)');
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

// ---- menu pricing per portion size ----
{
  ok(FS.SIZES.length === 4, 'four portion sizes (klein → familiepak)');
  const g = FS.freshGame();
  ok(FS.priceOf(g, 'middel') === FS.sizeDef('middel').fair, 'prices default to the fair price');
  ok(Math.abs(FS.valueFactor(g) - 1) < 1e-9, 'at fair prices, value factor is neutral');
  // raise prices → bigger tickets but fewer customers (lower value factor)
  const dear = FS.freshGame(); FS.SIZES.forEach(z => dear.prices[z.id] = z.fair * 2);
  ok(FS.orderValue(dear, { fav: null, spend: 1 }, 1) > FS.orderValue(g, { fav: null, spend: 1 }, 1), 'higher prices earn more per order');
  ok(FS.valueFactor(dear) < 1, 'over-pricing hurts value-for-money (less traffic)');
  // cut prices → smaller tickets but more traffic
  const cheap = FS.freshGame(); FS.SIZES.forEach(z => cheap.prices[z.id] = Math.round(z.fair * 0.6));
  ok(FS.valueFactor(cheap) > 1, 'a bargain menu pulls more people');
  ok(FS.orderValue(cheap, { fav: null, spend: 1 }, 1) < base, 'but each order earns less');
  // a higher-rank friet lifts the whole menu
  const ranked = FS.freshGame(); ranked.dish.friet.rank = 5;
  ok(FS.orderValue(ranked, { fav: null, spend: 1 }, 1) > base, 'higher friet rank raises the ticket at the same prices');
}

// ---- weekly contests ----
{
  ok(FS.CONTESTS.length >= 4, 'a rotation of weekly contests');
  ok(FS.contestFor(1).id !== FS.contestFor(2).id, 'the contest rotates week to week');
  ok(FS.contestFor(1).id === FS.contestFor(1 + FS.CONTESTS.length).id, 'contests cycle');
  const c = FS.newContest(1);
  ok(c.progress === 0 && c.done === false && FS.contestDef(c.id), 'a fresh contest starts at 0 and is real');
  FS.CONTESTS.forEach(ct => { ok(ct.target > 0 && ct.reward && (ct.reward.faam || ct.reward.cash), `contest ${ct.id} has a target and a reward`); });
  const g = FS.freshGame();
  ok(g.contest && FS.contestDef(g.contest.id), 'fresh game carries a live contest');
}

// ---- marketing campaigns ----
{
  ok(FS.CAMPAIGNS.length >= 3, 'several ad campaigns to unlock + run');
  FS.CAMPAIGNS.forEach(c => { ok(c.req && FS.RESEARCH.find(r => r.id === c.req), `campaign ${c.id} needs a research unlock`); ok(c.cost > 0 && c.appeal > 0 && c.dur > 0, `campaign ${c.id} has cost/appeal/duration`); });
  const g = FS.freshGame();
  ok(FS.campaignAppeal(g) === 0, 'no appeal boost with no active campaign');
  const a0 = FS.computeAppeal(g);
  g.campaign = { id: FS.CAMPAIGNS[0].id, left: 10 };
  ok(FS.campaignAppeal(g) === FS.CAMPAIGNS[0].appeal, 'an active campaign adds its appeal');
  ok(FS.computeAppeal(g) > a0, 'running a campaign lifts overall appeal (more traffic)');
  g.campaign.left = 0;
  ok(FS.campaignAppeal(g) === 0, 'an expired campaign gives no boost');
}

// ---- shady mechanics ----
{
  ok(FS.SHADY.length >= 2, 'several louche practices');
  const g = FS.freshGame();
  ok(FS.shadyIncomeMul(g) === 1 && FS.shadyAppeal(g) === 0 && FS.shadyHeatRate(g) === 0, 'clean shop: no shady effects');
  g.shady = { tax: true };
  const tax = FS.shadyDef('tax');
  ok(Math.abs(FS.shadyIncomeMul(g) - tax.income) < 1e-9, 'zwart geld raises the income multiplier');
  ok(FS.shadyHeatRate(g) === tax.heat, 'an active shady practice builds heat');
  ok(FS.orderValue(g, { fav: null, spend: 1 }, 1) > FS.orderValue(FS.freshGame(), { fav: null, spend: 1 }, 1), 'louche margin earns more per order');
  g.shady = { oil: true };
  ok(FS.shadyAppeal(g) < 0, 'dirty oil hurts appeal');
  ok(FS.computeAppeal(g) < FS.computeAppeal(FS.freshGame()), 'cutting corners lowers overall appeal');
}

// ---- competitors / rival frituren ----
{
  ok(FS.RIVALS.length >= 3, 'a pool of rival frituren exists');
  const g = FS.freshGame();
  ok(Array.isArray(g.rivals) && g.rivals.length === 0, 'fresh game starts with no rivals');
  // with no rivals you own the whole street
  ok(Math.abs(FS.marketShare(g) - 1) < 1e-9, 'no rivals → 100% market share');
  ok(Math.abs(FS.marketMul(g) - 1) < 1e-9, 'no rivals → full traffic multiplier');
  ok(FS.buurtRank(g) === 1 && FS.rivalBoard(g).length === 1, 'alone at the top of an empty street');
  // a strong rival steals share and dampens (but never kills) traffic
  g.rivals = [{ id: 'jef', nm: 'Frituur Jef', emoji: '🍟', appeal: 1000 }];
  ok(FS.marketShare(g) < 0.5, 'a big rival takes most of the market share');
  ok(FS.marketMul(g) > 0.5 && FS.marketMul(g) < 1, 'crowded street softly cuts traffic but leaves a floor');
  // board sorts by appeal, best first, and the player is flagged
  const board = FS.rivalBoard(g);
  ok(board[0].appeal >= board[board.length - 1].appeal, 'board is sorted strongest-first');
  ok(board.some(r => r.you), 'the player appears on the board');
  ok(FS.buurtRank(g) === 2, 'a stronger rival pushes the player to #2');
  // rivals persist across save/load
  const rt = FS.marketMul(g);
  ok(typeof rt === 'number' && rt === rt, 'market multiplier is a finite number');
}

// ---- historical timeline events ----
{
  ok(FS.TIMELINE.length >= 5, 'a run of historical events exists');
  ok(FS.TIMELINE.every(e => typeof e.week === 'number' && e.title && e.emoji), 'each event is well-formed');
  const g = FS.freshGame();
  ok(g.timeline && g.timeline.seen && typeof g.timeline.seen === 'object', 'fresh game seeds a timeline');
  ok(FS.eventMod(g) === null, 'no active event modifier on a fresh game');
  ok(FS.eventTrafficMul(g) === 1 && FS.eventSpendMul(g) === 1, 'no modifier → neutral multipliers');
  // a traffic modifier boosts foot traffic
  g.timeline.mod = { id: 'wk', emoji: '⚽', label: '⚽ Test', weeksLeft: 2, traffic: 1.5, spend: 1 };
  ok(FS.eventTrafficMul(g) === 1.5 && FS.eventSpendMul(g) === 1, 'a traffic event scales traffic only');
  // a spend modifier raises the ticket
  const gs = FS.freshGame();
  gs.timeline.mod = { id: 'heat', emoji: '🥵', label: '🥵 Test', weeksLeft: 1, traffic: 1, spend: 1.3 };
  ok(FS.orderValue(gs, { fav: null, spend: 1 }, 1) > FS.orderValue(FS.freshGame(), { fav: null, spend: 1 }, 1), 'a spend event fattens each ticket');
  // a crisis modifier shrinks the ticket
  const gc = FS.freshGame();
  gc.timeline.mod = { id: 'crisis', emoji: '📉', label: '📉 Test', weeksLeft: 1, traffic: 1, spend: 0.8 };
  ok(FS.orderValue(gc, { fav: null, spend: 1 }, 1) < FS.orderValue(FS.freshGame(), { fav: null, spend: 1 }, 1), 'a crisis event trims each ticket');
  // events look up cleanly by id
  ok(FS.timelineDef(FS.TIMELINE[0].id) === FS.TIMELINE[0], 'event lookup by id works');
}

// ---- empire: multi-shop city map (Stage 1) ----
{
  ok(FS.CITY_LOTS.length >= 3, 'the city has several lots');
  ok(FS.CITY_LOTS.every(l => l.id && l.nm && typeof l.x === 'number' && typeof l.y === 'number'), 'each lot is well-formed');
  ok(FS.lotDef(FS.CITY_LOTS[0].id) === FS.CITY_LOTS[0], 'lot lookup by id works');
  ok(FS.lotDef('nope') === null, 'unknown lot → null');
  // opening cost escalates with each shop, first extra shop is the base
  ok(FS.openShopCost(1) < FS.openShopCost(2), 'each new shop costs more than the last');
  ok(FS.openShopCost(1) === 2000, 'the second shop costs the base price');
  // idle income: none for an empty blob, scales with appeal + serves, caps offline
  ok(FS.idleRate(null) === 0 && FS.idleIncome(null, 9999) === 0, 'a missing shop earns nothing');
  const blob = { appealSnap: 40, servedSnap: 100 };
  ok(FS.idleRate(blob) > 0, 'a developed shop has a positive idle rate');
  ok(FS.idleIncome(blob, 100) === Math.round(FS.idleRate(blob) * 100), 'idle income is rate × seconds');
  ok(FS.idleIncome(blob, FS.IDLE_CAP_SEC * 5) === FS.idleIncome(blob, FS.IDLE_CAP_SEC), 'idle income caps at the offline limit');
  const rich = { appealSnap: 80, servedSnap: 100 }, poor = { appealSnap: 10, servedSnap: 100 };
  ok(FS.idleRate(rich) > FS.idleRate(poor), 'a higher-appeal shop earns more while idle');
}

// ---- empire: country map of cities (Stage 2) ----
{
  ok(FS.COUNTRY.length >= 3, 'the country has several cities');
  ok(FS.COUNTRY.every(c => c.id && c.nm && c.sub && typeof c.x === 'number' && typeof c.y === 'number'), 'each city is well-formed');
  ok(FS.cityDef(FS.START_PLANET, FS.START_COUNTRY, FS.COUNTRY[0].id) === FS.COUNTRY[0], 'city lookup within a country works');
  ok(FS.cityDef(FS.START_PLANET, FS.START_COUNTRY, 'atlantis') === null, 'unknown city → null');
  ok(typeof FS.START_CITY === 'string' && FS.cityDef(FS.START_PLANET, FS.START_COUNTRY, FS.START_CITY), 'the starting city is a real city in the start country');
  // city ids are unique within the home country
  const ids = FS.COUNTRY.map(c => c.id);
  ok(new Set(ids).size === ids.length, 'city ids are unique');
}

// ---- empire: globe of countries (Stage 3) ----
{
  ok(FS.WORLD.length >= 3, 'the globe has several countries');
  ok(FS.WORLD.every(c => c.id && c.nm && c.sub && c.emoji && Array.isArray(c.cities) && c.cities.length >= 1
    && typeof c.x === 'number' && typeof c.y === 'number'), 'each country is well-formed with its own cities');
  ok(FS.countryDef(FS.START_PLANET, FS.WORLD[0].id) === FS.WORLD[0], 'country lookup within a planet works');
  ok(FS.countryDef(FS.START_PLANET, 'narnia') === null, 'unknown country → null');
  ok(typeof FS.START_COUNTRY === 'string' && FS.countryDef(FS.START_PLANET, FS.START_COUNTRY), 'the starting country is a real country on the start planet');
  // the home country nests the Belgian cities
  ok(FS.countryDef(FS.START_PLANET, FS.START_COUNTRY).cities === FS.COUNTRY, 'the start country holds the home cities');
  ok(FS.citiesOf(FS.START_PLANET, FS.START_COUNTRY) === FS.COUNTRY, 'citiesOf returns a country\'s cities');
  ok(FS.citiesOf(FS.START_PLANET, 'narnia').length === 0, 'citiesOf an unknown country is empty');
  // country ids are unique on Earth
  const cids = FS.WORLD.map(c => c.id);
  ok(new Set(cids).size === cids.length, 'country ids are unique');
  // city ids within each country are unique, and cityDef resolves per-country
  let allUnique = true, resolves = true;
  FS.WORLD.forEach(co => {
    const ids = co.cities.map(c => c.id);
    if (new Set(ids).size !== ids.length) allUnique = false;
    co.cities.forEach(c => { if (FS.cityDef(FS.START_PLANET, co.id, c.id) !== c) resolves = false; });
  });
  ok(allUnique, 'city ids are unique within each country');
  ok(resolves, 'cityDef resolves every city within its own country');
  // a different country has its own distinct cities
  const other = FS.WORLD.find(c => c.id !== FS.START_COUNTRY);
  ok(other && FS.cityDef(FS.START_PLANET, other.id, other.cities[0].id) === other.cities[0], 'a foreign country\'s cities resolve too');
}

// ---- empire: galaxy of planets (Stage 4, final) ----
{
  ok(FS.GALAXY.length >= 3, 'the galaxy has several planets');
  ok(FS.GALAXY.every(p => p.id && p.nm && p.sub && p.emoji && Array.isArray(p.countries) && p.countries.length >= 1
    && typeof p.x === 'number' && typeof p.y === 'number'), 'each planet is well-formed with its own countries');
  ok(FS.planetDef(FS.GALAXY[0].id) === FS.GALAXY[0], 'planet lookup by id works');
  ok(FS.planetDef('pluto') === null, 'unknown planet → null');
  ok(typeof FS.START_PLANET === 'string' && FS.planetDef(FS.START_PLANET), 'the starting planet is a real planet');
  // Earth nests the whole WORLD
  ok(FS.planetDef(FS.START_PLANET).countries === FS.WORLD, 'the start planet holds the Earth countries');
  ok(FS.countriesOf(FS.START_PLANET) === FS.WORLD, 'countriesOf returns a planet\'s countries');
  ok(FS.countriesOf('pluto').length === 0, 'countriesOf an unknown planet is empty');
  // planet ids unique
  const pids = FS.GALAXY.map(p => p.id);
  ok(new Set(pids).size === pids.length, 'planet ids are unique');
  // full four-tier resolution works on every planet: planet → country → city
  let resolves = true, hasScifi = false;
  FS.GALAXY.forEach(pl => {
    pl.countries.forEach(co => {
      if (FS.countryDef(pl.id, co.id) !== co) resolves = false;
      co.cities.forEach(c => { if (FS.cityDef(pl.id, co.id, c.id) !== c) resolves = false; });
    });
    if (pl.id !== FS.START_PLANET) hasScifi = true;
  });
  ok(resolves, 'cityDef resolves every city on every planet');
  ok(hasScifi, 'there are planets beyond Earth to expand to');
  // a sci-fi planet's country resolves only under its own planet, not Earth
  const scifi = FS.GALAXY.find(p => p.id !== FS.START_PLANET);
  const foreignCo = scifi.countries[0];
  ok(FS.countryDef(scifi.id, foreignCo.id) === foreignCo, 'a sci-fi planet\'s country resolves under its planet');
  ok(FS.countryDef(FS.START_PLANET, foreignCo.id) === null, 'that country does NOT resolve under Earth (planets are isolated)');
}

// ---- empire: shared money + location traits (rework A) ----
{
  // every place carries neutral-or-better traits after the stamping pass
  const homeCity = FS.cityDef(FS.START_PLANET, FS.START_COUNTRY, FS.START_CITY);
  ok(homeCity.traf >= 1 && homeCity.spend >= 1 && homeCity.cost >= 1, 'places have traf/spend/cost fields (default 1)');
  ok(FS.traitOf(homeCity, 'traf') === homeCity.traf, 'traitOf reads a field');
  ok(FS.traitOf(null, 'traf') === 1, 'traitOf of nothing is neutral');
  // Brussel is a busy capital → traffic > 1
  ok(homeCity.traf > 1, 'the capital draws extra traffic');
  // location multiplier stacks planet × country × city
  const scifi = FS.GALAXY.find(p => p.id !== FS.START_PLANET);
  const co = scifi.countries[0], ci = co.cities[0];
  const expected = FS.traitOf(scifi, 'spend') * FS.traitOf(co, 'spend') * FS.traitOf(ci, 'spend');
  ok(Math.abs(FS.locMul(scifi.id, co.id, ci.id, 'spend') - expected) < 1e-9, 'locMul multiplies down the hierarchy');
  // a rich sci-fi world pays more than the neutral home city
  ok(FS.locMul(scifi.id, co.id, ci.id, 'spend') > FS.locMul(FS.START_PLANET, FS.START_COUNTRY, FS.START_CITY, 'spend'), 'sci-fi worlds pay better');
  // opening cost scales with the location's cost multiplier
  const cheap = FS.openCostAt(FS.START_PLANET, FS.START_COUNTRY, 'luik');       // luik: no cost mult
  const dear  = FS.openCostAt(scifi.id, co.id, ci.id);                          // sci-fi: big cost mult
  ok(dear > cheap, 'a fancy location costs more to open');
  ok(FS.openCostAt(FS.START_PLANET, FS.START_COUNTRY, 'brussel') > FS.openCostAt(FS.START_PLANET, FS.START_COUNTRY, 'luik'), 'the capital costs more than a plain city');
  // location spend multiplier fattens an order
  const g = FS.freshGame(); g.locSpend = 2;
  ok(FS.orderValue(g, { fav: null, spend: 1 }, 1) > FS.orderValue(FS.freshGame(), { fav: null, spend: 1 }, 1), 'a richer location earns more per order');
}

// ---- empire: progressive zoom-out unlocking (rework B) ----
{
  // gate thresholds: 3 shops in a city → country, 3 cities → world, 3 countries → galaxy
  ok(FS.UNLOCK.country.metric === 'maxCity' && FS.UNLOCK.country.n === 3, 'country unlocks at 3 shops in one city');
  ok(FS.UNLOCK.world.metric === 'cities' && FS.UNLOCK.world.n === 3, 'world unlocks at 3 cities');
  ok(FS.UNLOCK.galaxy.metric === 'countries' && FS.UNLOCK.galaxy.n === 3, 'galaxy unlocks at 3 countries');
  // a brand-new empire (1 shop, 1 city) can zoom nowhere
  const start = { maxCity: 1, cities: 1, countries: 1 };
  ok(!FS.tierUnlockedWith(start, 'country'), 'a single shop cannot zoom out to the country');
  ok(!FS.tierUnlockedWith(start, 'world') && !FS.tierUnlockedWith(start, 'galaxy'), 'nothing higher is unlocked either');
  // fill the home city to 3 shops → country unlocks (but not world yet)
  const cityFull = { maxCity: 3, cities: 1, countries: 1 };
  ok(FS.tierUnlockedWith(cityFull, 'country'), '3 shops in a city unlocks the country map');
  ok(!FS.tierUnlockedWith(cityFull, 'world'), 'but the world stays locked until 3 cities');
  // 3 cities → world; 3 countries → galaxy
  ok(FS.tierUnlockedWith({ maxCity: 3, cities: 3, countries: 1 }, 'world'), '3 cities unlocks the world');
  ok(!FS.tierUnlockedWith({ maxCity: 3, cities: 3, countries: 1 }, 'galaxy'), 'galaxy still locked at 1 country');
  ok(FS.tierUnlockedWith({ maxCity: 3, cities: 3, countries: 3 }, 'galaxy'), '3 countries unlocks the galaxy');
  // an unknown tier is treated as always-open (no gate)
  ok(FS.tierUnlockedWith(start, 'city') === true, 'the city tier is never gated');
}

// ---- street decor (pavement signs that attract customers) ----
{
  ok(FS.STREET_OBJECTS.length >= 3, 'several street decorations exist');
  ok(FS.STREET_OBJECTS.every(o => o.id && o.nm && o.emoji && o.appeal > 0 && o.cost > 0), 'each street item is well-formed');
  ok(FS.streetDef(FS.STREET_OBJECTS[0].id) === FS.STREET_OBJECTS[0], 'street lookup by id works');
  ok(FS.streetDef('nope') === null, 'unknown street item → null');
  const g = FS.freshGame();
  ok(Array.isArray(g.street) && g.street.length === 0, 'fresh game starts with no street decor');
  ok(FS.streetAppeal(g) === 0, 'no street decor → no street appeal');
  // placing decor on the pavement raises appeal
  const before = FS.computeAppeal(g);
  const neon = FS.STREET_OBJECTS[0];
  g.street.push({ id: neon.id, col: 0, lvl: 1 });
  ok(FS.streetAppeal(g) === neon.appeal, 'one sign adds its appeal');
  ok(FS.computeAppeal(g) === before + neon.appeal, 'street decor lifts overall appeal');
  // a second sign stacks; leveling scales by power()
  g.street.push({ id: neon.id, col: 1, lvl: 1 });
  ok(FS.streetAppeal(g) === neon.appeal * 2, 'a second sign stacks');
  g.street[0].lvl = 2;
  ok(FS.streetAppeal(g) > neon.appeal * 2, 'a higher-level sign is worth more');
}

console.log(`frietkot_story: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
