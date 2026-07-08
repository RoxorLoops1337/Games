// Stable Story — logic tests for the horse ranch simulator.
import { loadHR } from './horse_ranch_lib.mjs';

const HR = loadHR();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } };
// deterministic rng factory for reproducible breeding/aging tests
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// ---- surface + data ----
ok(HR && typeof HR.freshGame === 'function', 'HR surface exposed');
ok(HR.BREEDS.length >= 10, 'at least 10 real breeds');
ok(HR.breedDef('arabian').name === 'Arabian', 'breedDef lookup');
ok(HR.breedDef('nope') === null, 'breedDef miss = null');
ok(HR.STAGES.length === 4 && HR.STAGES[0].id === 'foal', 'four life stages, foal first');
ok(new Set(HR.BREEDS.map(b => b.id)).size === HR.BREEDS.length, 'breed ids unique');
ok(HR.BREEDS.every(b => b.base > 0 && b.colors.length && b.rarity >= 1), 'every breed has price, colors, rarity');

// ---- fresh game ----
const G = HR.freshGame();
ok(G.money === 1500 && G.feed === 30 && G.day === 1, 'starts €1500, 30 hay, day 1');
ok(G.horses.length === 2, 'starts with two horses');
ok(G.horses.some(h => h.sex === 'mare') && G.horses.some(h => h.sex === 'stallion'), 'a mare and a stallion to breed with');
ok(G.stables.length === 1 && HR.stallsOf(G.stables[0]) === 4, 'one starter barn, 4 stalls');
ok(G.market.length >= 4, 'market stocked at start');

// ---- life stages / aging ----
ok(HR.stageForAge(0).id === 'foal', 'age 0 = foal');
ok(HR.stageForAge(7).id === 'yearling', 'age 7 = yearling');
ok(HR.stageForAge(20).id === 'adult', 'age 20 = adult');
ok(HR.stageForAge(80).id === 'senior', 'age 80 = senior');
ok(!HR.isAdult(HR.mkHorse({ breed: 'arabian', age: 3 })), 'foal is not adult');
ok(HR.isAdult(HR.mkHorse({ breed: 'arabian', age: 20 })), 'age-20 horse is adult');

// ---- feed scales with size ----
const pony = HR.mkHorse({ breed: 'shetland', age: 20 });
const draft = HR.mkHorse({ breed: 'clydesdale', age: 20 });
ok(HR.feedPerDay(draft) > HR.feedPerDay(pony), 'draft horse eats more than a pony');
ok(HR.feedPerDay(HR.mkHorse({ breed: 'arabian', age: 2 })) < HR.feedPerDay(HR.mkHorse({ breed: 'arabian', age: 20 })), 'foal eats less than adult');

// ---- valuation ----
const arab = HR.mkHorse({ breed: 'arabian', age: 20, speed: 80, stamina: 90, temperament: 60, health: 100, happy: 100, purebred: true });
const shet = HR.mkHorse({ breed: 'shetland', age: 20, speed: 30, stamina: 55, temperament: 70, health: 100, happy: 100, purebred: true });
ok(HR.valueOf(arab) > HR.valueOf(shet), 'arabian worth more than shetland');
const foalV = HR.mkHorse({ breed: 'arabian', age: 1, speed: 80, stamina: 90, temperament: 60, health: 100, happy: 100 });
ok(HR.valueOf(foalV) < HR.valueOf(arab), 'a foal is worth less than the same-stat adult');
const sick = HR.mkHorse({ breed: 'arabian', age: 20, speed: 80, stamina: 90, temperament: 60, health: 30, happy: 100, purebred: true });
ok(HR.valueOf(sick) < HR.valueOf(arab), 'poor health lowers value');
const grade = HR.mkHorse({ breed: 'arabian', age: 20, speed: 80, stamina: 90, temperament: 60, health: 100, happy: 100, purebred: false });
ok(HR.valueOf(grade) < HR.valueOf(arab), 'grade horse worth less than purebred');
ok(HR.buyPrice(arab) > HR.valueOf(arab) && HR.sellQuote(arab) < HR.valueOf(arab), 'buy above, sell below market value');
ok(HR.rentRate(arab) > 0 && HR.rentRate(arab) < HR.valueOf(arab), 'rent rate is a sane daily fraction');

// ---- stables ----
ok(HR.totalStalls(G) === 4 && HR.usedStalls(G) === 2 && HR.freeStalls(G) === 2, 'stall accounting');
const st = G.stables[0];
const before = HR.stallsOf(st);
st.level = 3;
ok(HR.stallsOf(st) > before, 'upgrading level adds stalls');
ok(HR.upgradeCost({ level: 3 }) > HR.upgradeCost({ level: 1 }), 'upgrade cost rises with level');
ok(HR.stableCost({ stables: [1, 2] }) > HR.stableCost({ stables: [1] }), 'each new stable costs more');

// ---- breeding ----
const mare = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20 });
const stallion = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20 });
ok(HR.canBreed(mare, stallion).ok, 'two adult opposite-sex horses can breed');
ok(!HR.canBreed(stallion, mare).ok, 'first pick must be the mare');
ok(!HR.canBreed(HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 3 }), stallion).ok, 'a foal mare cannot breed');
{
  const foal = HR.breedFoal(mare, stallion, rng(42));
  ok(foal.age === 0 && HR.stageForAge(foal.age).id === 'foal', 'newborn is a foal');
  ok(foal.breed === 'arabian' && foal.purebred === true, 'same-breed pairing = purebred of that breed');
  ok(foal.generation === 2, 'foal is one generation deeper');
  ok(['mare', 'stallion'].includes(foal.sex), 'foal has a valid sex');
}
{
  // cross-breed takes the rarer parent's breed and is graded
  const shetMare = HR.mkHorse({ breed: 'shetland', sex: 'mare', age: 20 });
  const cross = HR.breedFoal(shetMare, stallion, rng(99));
  ok(cross.breed === 'arabian' && cross.purebred === false, 'cross-breed = grade, rarer parent breed');
}

// ---- market restock scales with reputation ----
{
  const poor = { rep: 0 }, rich = { rep: 5000 };
  let sawRareForRich = false;
  const r = rng(7);
  for (let i = 0; i < 60; i++) { if (HR.marketPickBreed(rich, r).rarity >= 4) sawRareForRich = true; }
  ok(sawRareForRich, 'high reputation can surface elite/legendary stock');
  const r2 = rng(7);
  let maxPoor = 0;
  for (let i = 0; i < 60; i++) { maxPoor = Math.max(maxPoor, HR.marketPickBreed(poor, r2).rarity); }
  ok(maxPoor <= 2, 'low reputation is capped to common/uncommon stock');
}

// ---- daily simulation ----
{
  const g = HR.freshGame();
  const feed0 = g.feed;
  HR.advanceDay(g, rng(3));
  ok(g.day === 2, 'advanceDay increments the day');
  ok(g.feed < feed0, 'horses consume feed each day');
  ok(g.horses.every(h => h.age >= 1), 'horses age each day');
}
{
  // starvation hurts health/happiness
  const g = HR.freshGame(); g.feed = 0;
  const h0 = g.horses[0].health;
  HR.advanceDay(g, rng(5));
  ok(g.horses[0].health < h0, 'no feed damages horse health');
}
{
  // pregnancy resolves into a foal after gestation
  const g = HR.freshGame(); g.feed = 9999;
  const m = g.horses.find(h => h.sex === 'mare');
  m.pregnant = true; m.gestation = 2; m.sireBreed = m.breed;
  const n0 = g.horses.length;
  HR.advanceDay(g, rng(1)); // gestation 2->1
  ok(g.horses.length === n0, 'no birth before gestation ends');
  HR.advanceDay(g, rng(1)); // gestation 1->0 -> birth
  ok(g.horses.length === n0 + 1, 'foal born when gestation completes');
  ok(!m.pregnant, 'mare no longer pregnant after foaling');
}

// ---- reputation ranks ----
ok(HR.rankFor(0).name === 'Ranch Hand', 'starting rank');
ok(HR.rankFor(99999).rep >= HR.rankFor(0).rep, 'top rank reachable');
ok(HR.rankFor(1200).rep > HR.rankFor(100).rep, 'higher rep = higher rank tier');

// ---- training ----
{
  const h = HR.mkHorse({ breed: 'quarter', sex: 'stallion', age: 20, speed: 60, stamina: 55, temperament: 60 });
  ok(HR.statCap(h, 'speed') <= 100 && HR.statCap(h, 'speed') > h.speed, 'stat cap is above current, capped at 100');
  ok(HR.trainGain(h, 'speed') > 0, 'training gain positive below cap');
  const cheap = HR.trainCost(h, 'speed');
  h.speed = HR.statCap(h, 'speed'); // maxed
  ok(HR.trainGain(h, 'speed') === 0, 'no gain once at breed potential');
  ok(!HR.canTrain(h, 'speed').ok, 'cannot train a maxed stat');
  const lo = HR.mkHorse({ breed: 'quarter', age: 20, speed: 40 });
  const hi = HR.mkHorse({ breed: 'quarter', age: 20, speed: 78 });
  ok(HR.trainCost(hi, 'speed') > HR.trainCost(lo, 'speed'), 'training a higher stat costs more');
  const foal = HR.mkHorse({ breed: 'quarter', age: 2 });
  ok(!HR.canTrain(foal, 'speed').ok, 'foals cannot train');
}
{
  const h = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20, speed: 60, stamina: 60, temperament: 60 });
  const before = h.speed;
  const g = HR.applyTrain(h, 'speed');
  ok(g > 0 && h.speed === before + g, 'applyTrain raises the stat by the gain');
  ok(h.trains === 1, 'applyTrain records a session');
  h.trains = HR.TRAIN_PER_DAY;
  ok(!HR.canTrain(h, 'speed').ok, 'daily training sessions are limited');
  const preg = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20 }); preg.pregnant = true;
  ok(!HR.canTrain(preg, 'speed').ok, 'a pregnant mare cannot train');
  const rented = HR.mkHorse({ breed: 'arabian', age: 20 }); rented.rentDays = 2;
  ok(!HR.canTrain(rented, 'speed').ok, 'a rented-out horse cannot train');
}
{
  // training resets each day
  const g = HR.freshGame(); g.feed = 9999;
  g.horses[0].trains = 3;
  HR.advanceDay(g, rng(2));
  ok(g.horses[0].trains === 0, 'training energy refreshes each day');
}

// ---- goals / milestone chain ----
{
  const g = HR.freshGame();
  ok(HR.GOALS.length >= 8, 'a milestone chain exists');
  ok(g.goalIdx === 0, 'fresh game starts on the first goal');
  ok(HR.currentGoal(g) === HR.GOALS[0], 'currentGoal points at the active goal');
  ok(HR.checkGoals(g).length === 0, 'no goal completes on an untouched fresh game');
}
{
  // completing the first goal (own 3 horses) advances and pays out
  const g = HR.freshGame();
  const m0 = g.money;
  g.horses.push(HR.mkHorse({ breed: 'mustang', age: 20 })); // now 3 horses
  const done = HR.checkGoals(g);
  ok(done.length >= 1 && done[0].id === 'own3', 'reaching 3 horses completes the first goal');
  ok(g.money > m0, 'goal reward paid out coins');
  ok(g.goalIdx >= 1, 'goal index advanced past the completed goal');
}
{
  // checkGoals can chain several completions and is idempotent afterwards
  const g = HR.freshGame(); g.rep = 999999; g.stats.born = 5; g.stats.bestSale = 99999; g.stats.showWins = 5; g.stats.maxGen = 9;
  g.stables.push({ id: 'st2', level: 1, baseStalls: 4 });
  for (let i = 0; i < 6; i++) g.horses.push(HR.mkHorse({ breed: 'akhalteke', age: 20 }));
  HR.checkGoals(g);
  ok(g.goalIdx === HR.GOALS.length, 'meeting every condition clears the whole chain');
  ok(HR.currentGoal(g) === null, 'no current goal once the chain is complete');
  ok(HR.checkGoals(g).length === 0, 'checkGoals is a no-op after the chain is done');
}

// ---- clamp helper ----
ok(HR.clamp(150, 0, 100) === 100 && HR.clamp(-5, 0, 100) === 0 && HR.clamp(50, 0, 100) === 50, 'clamp bounds values');

console.log(`horse_ranch: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
