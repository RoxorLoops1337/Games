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
ok(Array.isArray(G.objs) && FS.countKind(G.objs, 'fryer') === 1 && FS.countKind(G.objs, 'counter') === 1, 'starts with a fryer and a counter');
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

console.log(`frietkot_story: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
