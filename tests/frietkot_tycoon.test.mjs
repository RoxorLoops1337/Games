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
ok(FT.SIZES.some(s => s.id === G.size), 'default size is valid');
ok(FT.FATS.some(f => f.id === G.fat), 'default fat is valid');

// ---- makeCustomer: valid archetype + size wish + patience ----
for (let i = 0; i < 40; i++) {
  const c = FT.makeCustomer(G);
  ok(FT.ARCHETYPES.indexOf(c.arch) >= 0, 'customer has real archetype');
  ok(FT.SIZES.some(s => s.id === c.size), 'customer wants a real size');
  ok(c.pat > 0 && c.pat === c.patMax, 'customer patience initialised');
}

console.log(`frietkot_tycoon: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
