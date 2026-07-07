// Frietkot Tycoon — logic tests for the vertical slice.
import { loadFT } from './frietkot_tycoon_lib.mjs';

const FT = loadFT();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- the game actually loaded its surface ----
ok(FT && typeof FT.freshGame === 'function', 'FT surface exposed');

// ---- fmtFr: Belgian thousands separator ----
ok(FT.fmtFr(0) === '0', 'fmtFr 0');
ok(FT.fmtFr(70) === '70', 'fmtFr 70');
ok(FT.fmtFr(2000) === '2.000', 'fmtFr 2000 -> 2.000');
ok(FT.fmtFr(1234567) === '1.234.567', 'fmtFr millions');
ok(FT.fmtFr(-350) === '-350', 'fmtFr negative');

// ---- data integrity ----
ok(FT.SIZES.length === 4, 'four size SKUs');
ok(FT.SIZES.every(s => s.base >= s.cost), 'sizes: base price >= cost');
ok(FT.FATS.length === 3, 'three frying fats');
ok(FT.ARCHETYPES.length >= 6, 'at least 6 customer archetypes');
ok(FT.ARCHETYPES.every(a => a.band[0] < a.band[1] && a.band[0] >= 0 && a.band[1] <= 100), 'archetype bands valid');
ok(FT.sizeById('groot').label === 'groot', 'sizeById lookup');
ok(FT.sizeById('nope').id === 'medium', 'sizeById fallback -> medium');
ok(FT.fatById('ossewit').tasteMul > FT.fatById('veg').tasteMul, 'tallow tastier than veg oil');

// ---- crispLabel scale (both ends are defects) ----
ok(FT.crispLabel(5) === 'papperig', 'crispLabel low = papperig');
ok(FT.crispLabel(52) === 'klassiek', 'crispLabel mid = klassiek');
ok(FT.crispLabel(75) === 'krokant', 'crispLabel high = krokant');
ok(FT.crispLabel(95) === 'verbrand', 'crispLabel top = verbrand (defect)');

// ---- crispQuality: 1.0 inside the band, falls off with distance ----
const band = [40, 60];
ok(near(FT.crispQuality(50, band), 1), 'crispQuality centre = 1');
ok(near(FT.crispQuality(40, band), 1), 'crispQuality band edge = 1');
ok(FT.crispQuality(75, band) < 1 && FT.crispQuality(75, band) > 0, 'crispQuality outside band partial');
ok(FT.crispQuality(100, band) < FT.crispQuality(75, band), 'crispQuality further = worse');
ok(FT.crispQuality(0, band) >= 0, 'crispQuality never negative');

// ---- oilQuality: monotonic, 1.0 when fresh, poor when black ----
ok(near(FT.oilQuality(100), 1), 'oilQuality fresh = 1');
ok(near(FT.oilQuality(60), 1), 'oilQuality 60 = 1 (threshold)');
ok(FT.oilQuality(35) < 1 && FT.oilQuality(35) > FT.oilQuality(20), 'oilQuality mid band');
ok(FT.oilQuality(5) < 0.5, 'oilQuality near-black is bad');
for (let o = 0; o < 100; o += 5) ok(FT.oilQuality(o) <= FT.oilQuality(o + 5) + 1e-9, 'oilQuality monotonic @' + o);

// ---- priceAppeal: cheaper = more appealing, clamped ----
const fair = 65;
ok(FT.priceAppeal(40, fair) > FT.priceAppeal(65, fair), 'cheaper more appealing');
ok(FT.priceAppeal(65, fair) > FT.priceAppeal(120, fair), 'pricey less appealing');
ok(FT.priceAppeal(500, fair) >= 0.10, 'appeal floor');
ok(FT.priceAppeal(1, fair) <= 1.30, 'appeal ceiling');

// ---- serveQuality: fresh oil + matched crisp beats stale oil + bad crisp ----
const good = FT.serveQuality({ crisp: 50, band, oil: 100, potato: 0.82, fat: 1.14 });
const bad = FT.serveQuality({ crisp: 95, band, oil: 8, potato: 0.82, fat: 0.9 });
ok(good > bad, 'good serve beats bad serve');
ok(good > 0.8, 'good serve is high quality');
ok(bad < 0.5, 'bad serve is low quality');
ok(FT.serveQuality({ crisp: 50, band, oil: 100, potato: 0.82, fat: 1 }) <= 1.05, 'quality capped');

// ---- freshGame: sane starting state ----
const G = FT.freshGame();
ok(G.money === 2000 && G.day === 1, 'starts with 2000 fr. on day 1');
ok(G.oil === 100, 'starts with fresh oil');
ok(G.rep >= 0 && G.rep <= 100, 'rep in range');
ok(typeof G.shop === 'string' && G.shop.length > 0, 'has a shop name');
ok(G.prices && G.prices.klein > 0 && G.prices.groot > 0, 'starts with a per-shop price sheet');
ok(FT.FATS.some(f => f.id === G.fat), 'default fat is valid');

// ---- makeCustomer: valid archetype + size wish + patience ----
for (let i = 0; i < 40; i++) {
  const c = FT.makeCustomer(G);
  ok(FT.ARCHETYPES.indexOf(c.arch) >= 0, 'customer has real archetype');
  ok(FT.SIZES.some(s => s.id === c.size), 'customer wants a real size');
  ok(c.pat > 0 && c.pat === c.patMax, 'customer patience initialised');
}

// ---- menu data integrity (snacks & sauces) ----
ok(FT.SNACKS.length === 9, 'nine snacks');
ok(FT.snackById('viandel').label === 'viandel', 'viandel added');
ok(FT.snackById('boulet').label === 'boulet', 'boulet added');
ok(FT.SAUCES.length === 6, 'six sauces');
ok(FT.SAUCES[0].id === 'mayo' && FT.SAUCES[0].unlock === 0, 'mayo is free/default');
ok(FT.SNACKS.every(s => s.price > s.cost && s.unlock > 0), 'snacks priced above cost, cost to unlock');
ok(FT.SAUCES.every(s => s.price > s.cost), 'sauces priced above cost');
ok(FT.snackById('bicky').label === 'bickyburger', 'snackById lookup');
ok(FT.snackById('curryworst').label === 'curryworst', 'frikandel is curryworst in BE');
ok(FT.snackById('frikandel') === null, 'no Dutch "frikandel" id remains');
ok(FT.snackById('nope') === null, 'snackById miss = null');
ok(FT.sauceById('andalouse').label === 'andalouse', 'sauceById lookup');

// ---- upgrades ----
ok(FT.UPG.length === 4, 'four equipment upgrades');
ok(FT.upgById('fryer').max === 4, 'fryer upgradeable 4x');
ok(FT.upgradeCost(700, 0) === 700, 'upgradeCost lvl0 = base');
ok(FT.upgradeCost(700, 1) > FT.upgradeCost(700, 0), 'upgradeCost rises with level');
ok(FT.upgradeCost(700, 3) > FT.upgradeCost(700, 2), 'upgradeCost keeps rising');

// ---- derived stats ----
ok(near(FT.effPotato(0), 0.82), 'effPotato base = 0.82');
ok(FT.effPotato(3) > FT.effPotato(1), 'better Bintjes raise quality');
ok(FT.effPotato(99) <= 0.99, 'potato quality capped');
ok(near(FT.fryerFootMul(0), 1), 'fryerFootMul base = 1');
ok(FT.fryerFootMul(4) > FT.fryerFootMul(0), 'bigger fryer = more footfall');
ok(FT.wage(0) === 0 && FT.wage(2) === 2 * FT.STAFF_WAGE, 'wage linear in staff');

// ---- double-fry helps a mismatched serve ----
const noDF = FT.serveQuality({ crisp: 90, band: [40, 60], oil: 100, potato: 0.82, fat: 1 });
const withDF = FT.serveQuality({ crisp: 90, band: [40, 60], oil: 100, potato: 0.82, fat: 1, doublefry: 1 });
ok(withDF > noDF, 'double-fry forgives a crispness miss');

// ---- oilDecayMul: filter & fryer both slow decay ----
const Gbase = FT.freshGame();
const baseDecay = FT.oilDecayMul(Gbase);
const Gfilter = FT.freshGame(); Gfilter.up.filter = 1;
ok(FT.oilDecayMul(Gfilter) < baseDecay, 'vetfilter slows oil decay');
const Gfryer = FT.freshGame(); Gfryer.up.fryer = 4;
ok(FT.oilDecayMul(Gfryer) < baseDecay, 'bigger fryer slows oil decay');

// ---- unlockedCount ignores default mayo ----
const Gm = FT.freshGame();
ok(FT.unlockedCount(Gm) === 0, 'fresh game: only free mayo, count 0');
Gm.menu.sauces.andalouse = true; Gm.menu.snacks.curryworst = true;
ok(FT.unlockedCount(Gm) === 2, 'unlockedCount counts extras');

// ---- per-shop price sheet ----
{
  const P = FT.freshGame();
  ok(P.prices.klein === FT.FAIR_PRICE.klein, 'default pack price = fair price');
  ok(FT.priceOf(P, 'klein') === FT.FAIR_PRICE.klein, 'priceOf reads default');
  P.prices.groot = 150;
  ok(FT.priceOf(P, 'groot') === 150, 'priceOf reads the shop price sheet');
  ok(FT.defaultPrices().familie === FT.FAIR_PRICE.familie, 'defaultPrices matches fair prices');
  ok(FT.itemCost('groot') === FT.sizeById('groot').cost, 'itemCost for a pack');
  ok(FT.itemCost('curryworst') === FT.snackById('curryworst').cost, 'itemCost for a snack');
  // cheaper price sheet => more appeal & more arrivals
  const dear = FT.freshGame(); FT.SIZES.forEach(s => dear.prices[s.id] = FT.FAIR_PRICE[s.id] * 2);
  const cheapS = FT.freshGame(); FT.SIZES.forEach(s => cheapS.prices[s.id] = Math.round(FT.FAIR_PRICE[s.id] * 0.8));
  ok(FT.friesAppeal(cheapS) > FT.friesAppeal(dear), 'cheaper price sheet = more appeal');
  ok(FT.itemAppeal(cheapS, 'klein') > FT.itemAppeal(dear, 'klein'), 'per-item appeal reflects price');
}

// ---- freshGame carries the new fields ----
const Gn = FT.freshGame();
ok(Gn.up && Gn.up.fryer === 0 && Gn.up.doublefry === 0, 'starts with no upgrades');
ok(Gn.staff === 0, 'starts with no staff');
ok(Gn.menu && Gn.menu.sauces.mayo === true, 'starts with mayo on the menu');
ok(Object.keys(Gn.menu.snacks).length === 0, 'starts with no snacks unlocked');

// ---- makeCustomer now carries snack/sauce wishes (object or null) ----
let sawSnack = false, sawSauce = false;
for (let i = 0; i < 60; i++) {
  const c = FT.makeCustomer(Gn);
  if (c.snack) { sawSnack = true; ok(FT.SNACKS.indexOf(c.snack) >= 0, 'wanted snack is real'); }
  if (c.sauce) { sawSauce = true; ok(FT.SAUCES.indexOf(c.sauce) >= 0, 'wanted sauce is real'); }
}
ok(sawSnack, 'some customers want a snack');
ok(sawSauce, 'some customers want a sauce');

// ---- districts / demographics ----
ok(FT.DISTRICTS.length >= 5, 'several districts defined');
ok(FT.districtById('student').weights.student > FT.districtById('student').weights.werk, 'student quarter skews student');
ok(FT.districtById('nope').id === 'dorp', 'districtById fallback = dorp');
ok(FT.archById('purist').id === 'purist', 'archById lookup');
ok(FT.archById('nope') === FT.ARCHETYPES[0], 'archById fallback');

// archetypeFor: single-weight always returns that archetype; weighted respects the split
ok(FT.archetypeFor({ purist: 1 }).id === 'purist', 'archetypeFor single key');
ok(FT.archetypeFor({ student: 1 }, 0.99).id === 'student', 'archetypeFor honours only key');
{
  const w = { student: 9, purist: 1 };
  let stu = 0;
  for (let i = 0; i < 400; i++) if (FT.archetypeFor(w).id === 'student') stu++;
  ok(stu > 280, 'archetypeFor weights the draw (student dominant)');
}

// ---- arrival & service rates ----
const Ga = FT.freshGame();
ok(FT.arrivalRate(Ga, 1) > 0, 'arrival rate positive');
ok(FT.arrivalRate(Ga, 1.5) > FT.arrivalRate(Ga, 1), 'higher demand = more arrivals');
{
  const cheap = FT.freshGame(); FT.SIZES.forEach(s => cheap.prices[s.id] = Math.round(FT.FAIR_PRICE[s.id] * 0.7));
  const dear = FT.freshGame(); FT.SIZES.forEach(s => dear.prices[s.id] = Math.round(FT.FAIR_PRICE[s.id] * 1.8));
  ok(FT.arrivalRate(cheap, 1) > FT.arrivalRate(dear, 1), 'cheaper draws more customers');
  const busy = FT.freshGame(); busy.district = 'student';
  ok(FT.arrivalRate(busy, 1) > FT.arrivalRate(Ga, 1), 'busier district = more arrivals');
}
ok(near(FT.serviceRate(FT.freshGame()), 0.40), 'base service rate = 0.40/sec');
{
  const staffed = FT.freshGame(); staffed.staff = 2;
  ok(FT.serviceRate(staffed) > FT.serviceRate(FT.freshGame()), 'staff raise throughput');
  const bigFry = FT.freshGame(); bigFry.up.fryer = 3;
  ok(FT.serviceRate(bigFry) > FT.serviceRate(FT.freshGame()), 'bigger fryer raises throughput');
}

// ---- evalServe: auto-serve a queued customer ----
{
  const G = FT.freshGame();
  const cust = FT.makeCustomer(G);
  const r = FT.evalServe(G, cust);
  ok(r.ticket >= FT.priceOf(G, cust.size), 'ticket at least the pack price they bought');
  ok(r.sat >= 0 && r.sat <= 1.1, 'satisfaction in range');
  ok(r.decay > 0, 'serving consumes some oil');
  ok(typeof r.tip === 'number' && r.tip >= 0, 'tip is a non-negative number');
  // overpricing the pack lowers satisfaction
  const fair = FT.freshGame(); const gouge = FT.freshGame();
  FT.SIZES.forEach(s => gouge.prices[s.id] = FT.FAIR_PRICE[s.id] * 2);
  const cc = { arch: FT.archById('vaste'), size: 'groot', sauce: null, snack: null };
  ok(FT.evalServe(fair, cc).sat > FT.evalServe(gouge, cc).sat, 'gouging the price lowers satisfaction');
  // matching a purist with crispy fries + fresh oil beats a mismatch
  const pur = { arch: FT.archById('purist'), size: 'klein', sauce: null, snack: null };
  const Ggood = FT.freshGame(); Ggood.crisp = 74; Ggood.oil = 100;
  const Gbad = FT.freshGame(); Gbad.crisp = 20; Gbad.oil = 10;
  ok(FT.evalServe(Ggood, pur).sat > FT.evalServe(Gbad, pur).sat, 'matched policy satisfies the purist more');
}

// ---- makeCustomer now carries queue fields ----
{
  const c = FT.makeCustomer(FT.freshGame());
  ok(c.wait === 0 && c.pat > 0, 'queued customer has a wait timer and patience');
  ok(typeof c.shirt === 'string', 'customer has a shirt colour for the sprite');
}

// ---- multiple frietkoten / the map ----
{
  const g = FT.freshGame();
  ok(Array.isArray(g.shops) && g.shops.length === 1, 'starts with one frietkot');
  ok(g.active === 0, 'active shop index is 0');
  ok(g.shops[0].district === 'dorp', 'first shop is in the dorp');
  ok(g.shop === g.shops[0].shop && g.district === g.shops[0].district, 'active shop mirrored onto G');
  const s = FT.newShop('student');
  ok(s.district === 'student' && s.oil === 100 && s.rep === 6, 'newShop has fresh per-shop state');
  ok(s.prices && s.prices.groot > 0, 'newShop gets its own price sheet');
  ok(s.up && s.up.fryer === 0 && s.staff === 0, 'newShop starts unequipped');
  ok(FT.openCost(1) > 0, 'a 2nd frietkot costs money');
  ok(FT.openCost(3) > FT.openCost(2) && FT.openCost(2) > FT.openCost(1), 'each extra frietkot costs more');
  ok(FT.SHOP_FIELDS.indexOf('prices') >= 0 && FT.SHOP_FIELDS.indexOf('district') >= 0, 'per-shop fields include prices & district');
  ok(FT.SHOP_FIELDS.indexOf('money') < 0, 'money is global, not per-shop');
}

console.log(`frietkot_tycoon: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
