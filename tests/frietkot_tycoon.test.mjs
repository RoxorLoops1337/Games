// Frietkot Rush — logic tests for the active arcade.
import { loadFT } from './frietkot_tycoon_lib.mjs';

const FR = loadFT();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---- surface loaded ----
ok(FR && typeof FR.newOrder === 'function', 'FR surface exposed');

// ---- menu data ----
ok(FR.SNACKS.length === 3 && FR.SAUCES.length === 3, 'snacks & sauces present');
ok(FR.CRISP.length === 3, 'three crispness targets');
ok(FR.CRISP.every(c => c.band[0] < c.band[1]), 'crisp bands valid');
ok(FR.byId(FR.SNACKS, 'curryworst').nm === 'curryworst', 'byId lookup');
ok(FR.byId(FR.SNACKS, 'nope') === null, 'byId miss = null');

// ---- difficulty ramps ----
ok(FR.diffOf(0) === 1, 'base difficulty 1');
ok(FR.diffOf(10) > FR.diffOf(0), 'difficulty rises with served count');

// ---- newOrder ----
for (let i = 0; i < 60; i++) {
  const o = FR.newOrder(i);
  ok(FR.CRISP.some(c => c.id === o.crisp), 'order has a real crisp target');
  ok(Array.isArray(o.band) && o.band.length === 2, 'order carries a doneness band');
  ok(o.snack === null || FR.SNACKS.some(s => s.id === o.snack), 'snack is null or real');
  ok(o.sauce === null || FR.SAUCES.some(s => s.id === o.sauce), 'sauce is null or real');
  ok(o.pat === o.patMax && o.pat >= 4 && o.pat <= 11, 'patience initialised and clamped');
}
// later orders are tighter on patience than the very first
ok(FR.newOrder(20).patMax < FR.newOrder(0).patMax, 'patience shrinks as the shift heats up');

// ---- friesQuality: golden band is best, raw & burnt are bad ----
const band = [70, 88];
ok(near(FR.friesQuality(79, band), 1), 'centre of band = perfect');
ok(near(FR.friesQuality(70, band), 1), 'band edge = perfect');
ok(FR.friesQuality(50, band) < 1 && FR.friesQuality(50, band) >= 0, 'undercooked = partial');
ok(FR.friesQuality(99, band) < 0.3, 'burnt = bad');
ok(FR.friesQuality(0, band) < FR.friesQuality(60, band), 'raw worse than nearly-done');
ok(FR.friesQuality(120, band) >= 0, 'quality never negative');

// ---- scoreServe ----
const order = { crisp: 'krokant', band: [70, 88], snack: 'bicky', sauce: 'samurai' };
// a flawless, fast serve high in combo
const perfect = FR.scoreServe(order, { friesQ: 79, snack: 'bicky', sauce: 'samurai' }, 1, 5);
ok(perfect.perfect === true, 'exact + golden + fast = perfect');
ok(perfect.ok === true && perfect.quality > 0.95, 'perfect serve high quality');
// wrong sauce breaks perfect and lowers quality
const wrongSauce = FR.scoreServe(order, { friesQ: 79, snack: 'bicky', sauce: 'mayo' }, 1, 5);
ok(wrongSauce.perfect === false, 'wrong sauce is not perfect');
ok(wrongSauce.quality < perfect.quality, 'wrong sauce lowers quality');
// missing fries entirely fails
const noFries = FR.scoreServe(order, { friesQ: null, snack: 'bicky', sauce: 'samurai' }, 1, 0);
ok(noFries.ok === false && noFries.fq === 0, 'no fries = failed serve');
// combo multiplies the tip
const lowCombo = FR.scoreServe(order, { friesQ: 79, snack: 'bicky', sauce: 'samurai' }, 1, 0);
const hiCombo = FR.scoreServe(order, { friesQ: 79, snack: 'bicky', sauce: 'samurai' }, 1, 15);
ok(hiCombo.tip > lowCombo.tip, 'higher combo pays more');
// speed matters
const slow = FR.scoreServe(order, { friesQ: 79, snack: 'bicky', sauce: 'samurai' }, 0.05, 5);
ok(perfect.tip > slow.tip, 'serving faster pays more');
// an order that wants nothing extra: giving nothing is correct
const plain = { crisp: 'klassiek', band: [50, 70], snack: null, sauce: null };
const plainOK = FR.scoreServe(plain, { friesQ: 60, snack: null, sauce: null }, 1, 0);
ok(plainOK.perfect === true, 'plain order served plain = perfect');
const plainWrong = FR.scoreServe(plain, { friesQ: 60, snack: 'bicky', sauce: null }, 1, 0);
ok(plainWrong.quality < plainOK.quality, 'adding an unwanted snack hurts');

// ---- freshRun ----
const R = FR.freshRun();
ok(R.score === 0 && R.combo === 0 && R.strikes === 0 && R.served === 0, 'fresh run zeroed');
ok(R.tray && R.tray.friesQ === null && R.basket === 'empty', 'fresh run has an empty tray & basket');

console.log(`frietkot_rush: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
