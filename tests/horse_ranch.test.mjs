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
  const g = HR.freshGame(); g.rep = 999999; g.stats.born = 5; g.stats.bestSale = 99999; g.stats.showWins = 5; g.stats.maxGen = 9; g.stats.bestTierWin = 4; g.day = 60;
  g.stables.push({ id: 'st2', level: 1, baseStalls: 4 });
  for (let i = 0; i < 6; i++) g.horses.push(HR.mkHorse({ breed: 'akhalteke', age: 20 }));
  g.horses.push(HR.mkHorse({ breed: 'akhalteke', age: 20, coat: { name: 'Golden', tier: 3 }, wins: 4 })); // satisfies rare-coat + champion goals
  g.canteen = { level: 2 }; g.teachers = [HR.mkTeacher(g, rng(1))]; // satisfies canteen + teacher goals
  g.hallOfFame = [HR.hofRecord(HR.mkHorse({ breed: 'arabian', age: 40, wins: 5 }), 'retired', 40)]; // satisfies HoF goals
  g.horses.push(HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, atStud: true })); g.stats.studIncome = 5000; // satisfies stud goals
  HR.checkGoals(g);
  ok(g.goalIdx === HR.GOALS.length, 'meeting every condition clears the whole chain');
  ok(HR.currentGoal(g) === null, 'no current goal once the chain is complete');
  ok(HR.checkGoals(g).length === 0, 'checkGoals is a no-op after the chain is done');
}

// ---- coat-colour genetics ----
{
  // phenotype mapping from allele sets
  const chestnut = HR.phenotype({ E: ['e', 'e'], A: ['a', 'a'], Cr: ['n', 'n'], G: ['n', 'n'] });
  ok(chestnut.name === 'Chestnut' && chestnut.tier === 0, 'ee = Chestnut (red base)');
  const bay = HR.phenotype({ E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['n', 'n'] });
  ok(bay.name === 'Bay', 'E_ A_ = Bay');
  const black = HR.phenotype({ E: ['E', 'E'], A: ['a', 'a'], Cr: ['n', 'n'], G: ['n', 'n'] });
  ok(black.name === 'Black', 'E_ aa = Black');
  const palomino = HR.phenotype({ E: ['e', 'e'], A: ['a', 'a'], Cr: ['C', 'n'], G: ['n', 'n'] });
  ok(palomino.name === 'Palomino' && palomino.tier === 1, 'red + single cream = Palomino (uncommon)');
  const cremello = HR.phenotype({ E: ['e', 'e'], A: ['a', 'a'], Cr: ['C', 'C'], G: ['n', 'n'] });
  ok(cremello.name === 'Cremello' && cremello.tier === 2, 'red + double cream = Cremello (rare)');
  const grey = HR.phenotype({ E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['G', 'n'] });
  ok(grey.name === 'Grey', 'grey allele masks the base colour');
  const golden = HR.phenotype({ E: ['e', 'e'], A: ['a', 'a'], Cr: ['n', 'n'], G: ['n', 'n'], mut: 'Golden' });
  ok(golden.name === 'Golden' && golden.tier === 3, 'mutation coat is legendary tier');
}
{
  // dominant/recessive inheritance: two single-cream parents CAN throw a double-dilute
  const a = { E: ['e', 'e'], A: ['a', 'a'], Cr: ['C', 'n'], G: ['n', 'n'], mut: null };
  const b = { E: ['e', 'e'], A: ['a', 'a'], Cr: ['C', 'n'], G: ['n', 'n'], mut: null };
  let sawDouble = false, sawZero = false;
  const r = rng(123);
  for (let i = 0; i < 200; i++) {
    const child = HR.crossGenes(a, b, r);
    const cc = child.Cr.filter(x => x === 'C').length;
    if (cc === 2) sawDouble = true;
    if (cc === 0) sawZero = true;
  }
  ok(sawDouble, 'two single-cream parents can produce a double-dilute foal');
  ok(sawZero, 'and can also produce a non-dilute foal (recessive segregation)');
}
{
  // rare coats are worth more
  const plain = HR.mkHorse({ breed: 'quarter', age: 20, speed: 70, stamina: 60, temperament: 70, health: 100, happy: 100, coat: { name: 'Bay', tier: 0 } });
  const fancy = HR.mkHorse({ breed: 'quarter', age: 20, speed: 70, stamina: 60, temperament: 70, health: 100, happy: 100, coat: { name: 'Cremello', tier: 2 } });
  ok(HR.coatValueMult(fancy) > HR.coatValueMult(plain), 'rarer coat tier = higher coat multiplier');
  ok(HR.valueOf(fancy) > HR.valueOf(plain), 'a rare-coat horse is worth more than a plain one');
  ok(HR.coatValueMult({ color: 'Bay' }) === 1, 'legacy horse with no coat defaults to ×1');
}
{
  // every fresh/market horse has genes + a coat now
  const g = HR.freshGame();
  ok(g.horses.every(h => h.genes && h.coat && h.coat.name), 'starter horses carry genes + a coat');
  ok(g.market.every(h => h.genes && h.coat), 'market horses carry genes + a coat');
}

// ---- pedigree + inbreeding ----
{
  const mare = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20, name: 'Mira' });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, name: 'Sol' });
  const foal = HR.breedFoal(mare, stal, rng(5));
  ok(foal.ped && foal.ped.dam.name === 'Mira' && foal.ped.sire.name === 'Sol', 'foal records both parents in its pedigree');
  ok(foal.coat && foal.coat.name, 'foal has a genetically-derived coat');
  ok(HR.relatedness(mare, stal) === 0, 'unrelated founders are not related');
  // inbreeding: breed the foal (as a dam) back to its own sire → shares an ancestor
  foal.sex = 'mare'; foal.age = 20;
  ok(HR.relatedness(foal, stal) > 0, 'a foal and its own sire are detected as related');
  const inbredFoal = HR.breedFoal(foal, stal, rng(6));
  ok(inbredFoal.inbred === true, 'breeding related horses flags the foal as inbred');
  ok(inbredFoal.health < 96, 'inbred foal starts with reduced health');
}
{
  // ancestorIds collects the horse + its recorded ancestors
  const mare = HR.mkHorse({ breed: 'shetland', sex: 'mare', age: 20 });
  const stal = HR.mkHorse({ breed: 'shetland', sex: 'stallion', age: 20 });
  const foal = HR.breedFoal(mare, stal, rng(9));
  const ids = HR.ancestorIds(foal, 2);
  ok(ids.has(foal.id) && ids.has(mare.id) && ids.has(stal.id), 'ancestorIds includes self and parents');
}

// ---- shows & competitions ----
{
  ok(HR.DISCIPLINES.length === 4 && HR.disciplineDef('race'), 'four disciplines with lookup');
  ok(HR.COMP_TIERS.length === 4 && HR.tierDef(1).name === 'Local Fair', 'four competition tiers');
  ok(HR.tierUnlocked({ rep: 0 }, HR.tierDef(1)) && !HR.tierUnlocked({ rep: 0 }, HR.tierDef(4)), 'tiers gate on reputation');
  ok(HR.highestTier({ rep: 5000 }).id === 4 && HR.highestTier({ rep: 0 }).id === 1, 'highestTier tracks unlocked tiers');
}
{
  // discipline scoring weights the right stats
  const sprinter = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 98, stamina: 50, temperament: 50, health: 100, happy: 100, trait: 'steady' });
  const stayer = HR.mkHorse({ breed: 'arabian', age: 20, speed: 50, stamina: 98, temperament: 50, health: 100, happy: 100, trait: 'steady' });
  ok(HR.disciplineScore(sprinter, HR.disciplineDef('race')) > HR.disciplineScore(stayer, HR.disciplineDef('race')), 'sprinter wins the racing score');
  ok(HR.disciplineScore(stayer, HR.disciplineDef('endurance')) > HR.disciplineScore(sprinter, HR.disciplineDef('endurance')), 'stayer wins the endurance score');
  const gentle = HR.mkHorse({ breed: 'friesian', age: 20, speed: 50, stamina: 50, temperament: 95, health: 100, happy: 100, trait: 'steady' });
  ok(HR.disciplineScore(gentle, HR.disciplineDef('dressage')) > HR.disciplineScore(sprinter, HR.disciplineDef('dressage')), 'calm horse wins dressage');
  // Showing rewards a fancy coat
  const plainShow = HR.mkHorse({ breed: 'quarter', age: 20, speed: 60, stamina: 60, temperament: 60, health: 100, happy: 100, coat: { name: 'Bay', tier: 0 }, trait: 'steady' });
  const fancyShow = HR.mkHorse({ breed: 'quarter', age: 20, speed: 60, stamina: 60, temperament: 60, health: 100, happy: 100, coat: { name: 'Cremello', tier: 2 }, trait: 'steady' });
  ok(HR.disciplineScore(fancyShow, HR.disciplineDef('halter')) > HR.disciplineScore(plainShow, HR.disciplineDef('halter')), 'coat tier boosts the Showing score');
}
{
  // a dominant horse wins; a hopeless one places last — deterministically at the extremes
  const star = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 100, stamina: 100, temperament: 100, health: 100, happy: 100 });
  const dud = HR.mkHorse({ breed: 'shetland', age: 20, speed: 10, stamina: 10, temperament: 10, health: 40, happy: 40 });
  const t1 = HR.tierDef(1), race = HR.disciplineDef('race');
  ok(HR.runCompetition(star, race, t1, rng(1)).place === 1, 'a dominant horse wins tier 1');
  ok(HR.runCompetition(dud, race, HR.tierDef(4), rng(1)).place === 4, 'a weak horse fails at the top tier');
}
{
  // applyCompetition mutates game + horse and records a trophy on a podium
  const g = HR.freshGame();
  const star = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 100, stamina: 100, temperament: 100, health: 100, happy: 100, name: 'Rocket' });
  g.horses.push(star);
  const m0 = g.money, rep0 = g.rep;
  const res = HR.applyCompetition(g, star, HR.disciplineDef('race'), HR.tierDef(1), rng(2));
  ok(res.place === 1, 'star wins');
  ok(g.money === m0 + res.prize && g.rep === rep0 + res.rep, 'prize + reputation awarded');
  ok(star.wins === 1 && star.entries === 1 && star.podiums === 1, 'career record updated');
  ok(g.trophies.length === 1 && g.trophies[0].horse === 'Rocket', 'trophy added to the cabinet');
  ok(star.compCd > g.day, 'horse goes on a rest cooldown after competing');
  ok(!HR.canEnterShow(g, star).ok, 'cannot re-enter while resting');
  ok(g.stats.bestTierWin === 1, 'best tier win tracked');
}
{
  // championship wins raise a horse's value
  const base = HR.mkHorse({ breed: 'arabian', age: 20, speed: 70, stamina: 70, temperament: 70, health: 100, happy: 100 });
  const champ = HR.mkHorse({ breed: 'arabian', age: 20, speed: 70, stamina: 70, temperament: 70, health: 100, happy: 100, wins: 5 });
  ok(HR.valueOf(champ) > HR.valueOf(base), 'a proven champion is worth more');
}
{
  // eligibility rules
  const g = HR.freshGame();
  ok(!HR.canEnterShow(g, HR.mkHorse({ breed: 'arabian', age: 2 })).ok, 'foals cannot compete');
  const preg = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20 }); preg.pregnant = true;
  ok(!HR.canEnterShow(g, preg).ok, 'pregnant mares cannot compete');
}

// ---- canteen ----
{
  const g = HR.freshGame();
  ok(HR.canteenLevel(g) === 0, 'canteen not built at start');
  ok(HR.canteenIncome(g) === 0, 'no canteen income before building');
  const c1 = HR.canteenCost(g);
  g.canteen.level = 1;
  ok(HR.canteenIncome(g) > 0, 'a built canteen earns daily income');
  const c2 = HR.canteenCost(g);
  ok(c2 > c1, 'each canteen upgrade costs more');
  g.canteen.level = HR.CANTEEN_MAX;
  ok(HR.canteenCost(g) === 0, 'no cost once canteen is maxed');
  // higher reputation & bigger herd => more visitors => more income
  const g2 = HR.freshGame(); g2.canteen.level = 1; g2.rep = 3000;
  ok(HR.canteenIncome(g2) > HR.canteenIncome({ canteen: { level: 1 }, rep: 0, horses: [], teachers: [] }), 'reputation lifts canteen income');
}

// ---- riding school / teachers ----
{
  const g = HR.freshGame();
  ok(Array.isArray(g.teacherMarket) && g.teacherMarket.length >= 1, 'teacher applicants available at start');
  ok(g.teacherMarket.every(t => t.skill >= 1 && t.skill <= 5 && t.salary > 0 && t.capacity > 0), 'teachers have skill/salary/capacity');
  ok(HR.teacherCount(g) === 0 && HR.schoolIncome(g) === 0 && HR.schoolNet(g) === 0, 'no school income with no teachers');
}
{
  // hire a teacher: income needs available horses; net = fees - salary
  const g = HR.freshGame(); g.rep = 500;
  const t = HR.mkTeacher(g, rng(3)); t.capacity = 6; t.salary = 40; t.skill = 3;
  g.teachers.push(t);
  ok(HR.schoolHorses(g) === 2, 'two starter adults are available for lessons');
  ok(HR.lessonsPerDay(g) > 0, 'lessons run when teachers and horses are present');
  ok(HR.schoolIncome(g) > 0, 'school earns lesson fees');
  ok(HR.schoolNet(g) === HR.schoolIncome(g) - HR.teacherSalaries(g), 'net = income minus salaries');
  // no horses => no lessons even with a teacher
  const g2 = HR.freshGame(); g2.horses = []; g2.teachers.push(HR.mkTeacher(g2, rng(4)));
  ok(HR.lessonsPerDay(g2) === 0 && HR.schoolIncome(g2) === 0, 'lessons need horses to teach on');
  ok(HR.schoolNet(g2) < 0, 'idle teachers still cost their salary');
}
{
  // capacity is capped by both teachers and horses
  const g = HR.freshGame();
  const t = HR.mkTeacher(g, rng(7)); t.capacity = 2; g.teachers = [t];
  ok(HR.lessonsPerDay(g) === Math.min(2, HR.schoolHorses(g) * 3), 'lessons capped by teacher capacity');
}
{
  // canteen + school income flows through advanceDay
  const g = HR.freshGame(); g.feed = 9999; g.canteen.level = 2; g.rep = 400;
  const t = HR.mkTeacher(g, rng(9)); t.capacity = 6; t.salary = 20; g.teachers.push(t);
  const m0 = g.money;
  HR.advanceDay(g, rng(11));
  ok(g.money > m0, 'canteen + lessons pay out overnight');
  ok(g.stats.lessons > 0, 'lessons given are tracked');
}
{
  // restockTeachers refreshes the applicant pool
  const g = HR.freshGame(); g.teacherMarket = [];
  HR.restockTeachers(g, rng(2));
  ok(g.teacherMarket.length >= 1, 'restockTeachers refills applicants');
}

// ---- personality traits ----
{
  ok(HR.TRAITS.length >= 6 && HR.traitDef('clever'), 'a set of personality traits exists');
  ok(HR.mkHorse({ breed: 'arabian', age: 20 }).trait, 'every horse gets a trait');
  ok(HR.traitMult({ trait: 'clever' }, 'train') > 1, 'clever boosts training gain');
  ok(HR.traitMult({ trait: 'lazy' }, 'train') < 1, 'lazy reduces training gain');
  ok(HR.traitMult({ trait: 'gentle' }, 'lesson') > 1, 'gentle makes a better lesson mount');
  ok(HR.traitMult({ trait: 'hot' }, 'disc', 'race') > 1, 'hot-headed horses are quicker racers');
  ok(HR.traitMult({ trait: 'hot' }, 'disc', 'dressage') < 1, 'hot-headed horses struggle at dressage');
  ok(HR.traitMult({ trait: 'clever' }, 'disc', 'race') === 1, 'unlisted discipline is neutral (×1)');
  ok(HR.traitMult({}, 'train') === 1 && HR.traitMult({ trait: 'nope' }, 'train') === 1, 'missing/unknown trait is neutral');
}
{
  // trait actually changes derived numbers
  const clever = HR.mkHorse({ breed: 'quarter', age: 20, speed: 50, trait: 'clever' });
  const lazy = HR.mkHorse({ breed: 'quarter', age: 20, speed: 50, trait: 'lazy' });
  ok(HR.trainGain(clever, 'speed') > HR.trainGain(lazy, 'speed'), 'clever out-trains lazy on the same stat');
  const hot = HR.mkHorse({ breed: 'quarter', age: 20, speed: 70, stamina: 60, temperament: 60, health: 100, happy: 100, trait: 'hot' });
  const calm = HR.mkHorse({ breed: 'quarter', age: 20, speed: 70, stamina: 60, temperament: 60, health: 100, happy: 100, trait: 'steady' });
  ok(HR.disciplineScore(hot, HR.disciplineDef('race')) > HR.disciplineScore(calm, HR.disciplineDef('race')), 'hot-headed scores higher in racing');
}
{
  // traits are inherited (with a small mutation chance)
  const mare = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20, trait: 'gentle' });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, trait: 'gentle' });
  let inherited = 0;
  for (let i = 0; i < 40; i++) { if (HR.breedFoal(mare, stal, rng(100 + i)).trait === 'gentle') inherited++; }
  ok(inherited >= 30, 'foals usually inherit a parent trait (both parents gentle)');
  ok(HR.breedFoal(mare, stal, rng(7)).trait, 'foal always ends up with some trait');
}
{
  // gentle horses lift riding-school income
  const gGentle = HR.freshGame(); gGentle.horses.forEach(h => h.trait = 'gentle'); gGentle.rep = 500;
  const gLazy = HR.freshGame(); gLazy.horses.forEach(h => h.trait = 'lazy'); gLazy.rep = 500;
  const t1 = HR.mkTeacher(gGentle, rng(1)); t1.capacity = 6; t1.skill = 3; gGentle.teachers.push(t1);
  const t2 = HR.mkTeacher(gLazy, rng(1)); t2.capacity = 6; t2.skill = 3; gLazy.teachers.push(t2);
  ok(HR.schoolLessonMult(gGentle) > HR.schoolLessonMult(gLazy), 'gentle horses raise the lesson multiplier');
  ok(HR.schoolIncome(gGentle) > HR.schoolIncome(gLazy), 'a gentle string earns more from lessons');
}

// ---- weekday calendar ----
{
  ok(HR.WEEKDAYS.length === 7 && HR.SCHEDULE.length === 7, 'a 7-day week with a schedule per day');
  ok(HR.weekdayIndex(1) === 0, 'day 1 is Monday (index 0)');
  ok(HR.weekdayIndex(7) === 6 && HR.weekdayIndex(8) === 0, 'the week wraps after Sunday');
  ok(HR.weekOf(1) === 1 && HR.weekOf(7) === 1 && HR.weekOf(8) === 2 && HR.weekOf(22) === 4, 'weeks count in 7-day blocks');
  // every discipline runs on at least one weekday, and some day has no show
  const allShown = new Set();
  let hasQuietDay = false;
  for (let d = 1; d <= 7; d++) { HR.showsToday(d).forEach(x => allShown.add(x)); if (!HR.isShowDay(d)) hasQuietDay = true; }
  ok(HR.DISCIPLINES.every(x => allShown.has(x.id)), 'each discipline is scheduled some day of the week');
  ok(hasQuietDay, 'at least one weekday has no competitions');
  // find a show day and a non-show day and check gating
  let showD = null, quietD = null;
  for (let d = 1; d <= 7; d++) { if (HR.isShowDay(d) && showD === null) showD = d; if (!HR.isShowDay(d) && quietD === null) quietD = d; }
  ok(HR.disciplineOpenToday(showD, HR.showsToday(showD)[0]) === true, 'a scheduled discipline is open on its day');
  ok(HR.showsToday(quietD).length === 0, 'no disciplines open on a quiet day');
  // nextShowDay always finds one within a week
  const ns = HR.nextShowDay(quietD);
  ok(ns && ns.inDays >= 1 && ns.inDays <= 7, 'nextShowDay points at an upcoming show day');
  // exactly one market day and one hay day in the week
  let markets = 0, hays = 0, cares = 0;
  for (let d = 1; d <= 7; d++) { if (HR.isMarketDay(d)) markets++; if (HR.isHayDay(d)) hays++; if (HR.isCareDay(d)) cares++; }
  ok(markets === 1 && hays === 1 && cares === 1, 'market, hay and care days each occur once a week');
}
{
  // market restocks when the simulation lands on a market day
  const marketWd = HR.SCHEDULE.findIndex(s => s.market);
  const g = HR.freshGame();
  g.day = marketWd + 7; // so that advanceDay's ++ lands on a market weekday
  const beforeMarket = g.market.map(h => h.id).join(',');
  HR.advanceDay(g, rng(4));
  ok(HR.isMarketDay(g.day), 'advanced onto a market day');
  ok(g.market.map(h => h.id).join(',') !== beforeMarket, 'market restocks on market day');
}
{
  // busy-day multipliers lift canteen + lesson income through advanceDay
  const busyWd = HR.SCHEDULE.findIndex(s => s.canteenBoost);
  ok(busyWd >= 0, 'there is a busy canteen day');
  ok(HR.canteenDayMult(busyWd + 1) > 1, 'canteen boost applies on the busy day');
  ok(HR.lessonDayMult(busyWd + 1) > 1, 'lesson boost applies on the busy day');
  ok(HR.canteenDayMult(1) === 1, 'ordinary days have no canteen boost');
}
{
  // show-invitation events only surface on show days
  const g = HR.freshGame(); g.horses.forEach(h => { h.health = 100; });
  // force a quiet day and confirm rollEvent never returns a 'show'
  let quietD = null; for (let d = 3; d <= 10; d++) { if (!HR.isShowDay(d)) { quietD = d; break; } }
  g.day = quietD;
  let sawShow = false;
  for (let i = 0; i < 50; i++) { const e = HR.rollEvent(g, rng(i + 1)); if (e && e.id === 'show') sawShow = true; }
  ok(!sawShow, 'no show invitations on a quiet day');
}

// ---- seasons ----
{
  ok(HR.SEASONS.length === 4 && HR.SEASON_LEN >= 7, 'four seasons of a few weeks each');
  ok(HR.seasonOf(1).id === 'spring', 'the game opens in Spring');
  ok(HR.seasonOf(HR.SEASON_LEN).id === 'spring' && HR.seasonOf(HR.SEASON_LEN + 1).id === 'summer', 'seasons roll after SEASON_LEN days');
  ok(HR.seasonOf(HR.SEASON_LEN * 3 + 1).id === 'winter', 'winter is the fourth season');
  ok(HR.seasonOf(HR.SEASON_LEN * 4 + 1).id === 'spring', 'the year wraps back to Spring');
  ok(HR.yearOf(1) === 1 && HR.yearOf(HR.SEASON_LEN * 4 + 1) === 2, 'a year is four seasons');
  ok(HR.seasonDay(1) === 1 && HR.seasonDay(HR.SEASON_LEN) === HR.SEASON_LEN, 'seasonDay counts within the season');
  // gameplay mods point the right way
  ok(HR.seasonBreedFeeMul(1) < 1, 'Spring makes breeding cheaper');
  ok(HR.seasonGestationAdj(1) < 0, 'Spring shortens gestation');
  ok(HR.seasonShowPrizeMul(HR.SEASON_LEN + 1) > 1, 'Summer boosts show prizes');
  ok(HR.seasonHayMul(HR.SEASON_LEN * 2 + 1) < 1, 'Autumn makes hay cheaper');
  ok(HR.seasonMarketBonus(HR.SEASON_LEN * 2 + 1) > 0, 'Autumn stocks a bigger market');
  ok(HR.seasonCanteenMul(HR.SEASON_LEN * 3 + 1) < 1, 'Winter thins the canteen crowd');
  ok(HR.seasonOf(HR.SEASON_LEN * 3 + 1).feedExtra > 0, 'Winter costs extra hay');
}
{
  // season biases the weather: winter is snowier than summer
  const summer0 = HR.SEASON_LEN, winter0 = HR.SEASON_LEN * 3;
  let sSnow = 0, wSnow = 0;
  for (let i = 1; i <= HR.SEASON_LEN; i++) {
    if (HR.weatherFor(summer0 + i).id === 'snow') sSnow++;
    if (HR.weatherFor(winter0 + i).id === 'snow') wSnow++;
  }
  ok(wSnow > sSnow, 'winter sees more snow than summer');
  let sSun = 0, wSun = 0;
  for (let i = 1; i <= HR.SEASON_LEN; i++) {
    if (HR.weatherFor(summer0 + i).id === 'sunny') sSun++;
    if (HR.weatherFor(winter0 + i).id === 'sunny') wSun++;
  }
  ok(sSun > wSun, 'summer is sunnier than winter');
}
{
  // Autumn market restock brings extra stock vs a plain season
  const gAut = HR.freshGame(); gAut.day = HR.SEASON_LEN * 2 + 2; // autumn
  const gSpr = HR.freshGame(); gSpr.day = 2; // spring
  HR.restockMarket(gAut, rng(4)); HR.restockMarket(gSpr, rng(4));
  ok(gAut.market.length > gSpr.market.length, 'autumn restock is larger than spring restock');
}
{
  // Summer boosts a competition payout through applyCompetition
  const star = { breed: 'thoroughbred', age: 20, speed: 100, stamina: 100, temperament: 100, health: 100, happy: 100 };
  const gSummer = HR.freshGame(); gSummer.day = HR.SEASON_LEN + 3; // summer
  const gSpring = HR.freshGame(); gSpring.day = 3; // spring
  const hS = HR.mkHorse({ ...star, name: 'A' }); const hP = HR.mkHorse({ ...star, name: 'B' });
  gSummer.horses.push(hS); gSpring.horses.push(hP);
  const m0s = gSummer.money, m0p = gSpring.money;
  const rS = HR.applyCompetition(gSummer, hS, HR.disciplineDef('race'), HR.tierDef(1), rng(2));
  const rP = HR.applyCompetition(gSpring, hP, HR.disciplineDef('race'), HR.tierDef(1), rng(2));
  ok(rS.place === 1 && rP.place === 1, 'both stars win their tier-1 race');
  ok((gSummer.money - m0s) > (gSpring.money - m0p), 'summer pays a bigger show prize than spring');
}

// ---- weather ----
{
  ok(HR.WEATHER.length === 4 && HR.weatherDef('rain').id === 'rain', 'four weather types with lookup');
  // deterministic: same day → same weather
  ok(HR.weatherFor(37).id === HR.weatherFor(37).id, 'weather is stable for a given day');
  ok(HR.weatherFor(37) === HR.weatherFor(37), 'weatherFor returns the same object for the same day');
  // effect direction
  ok(typeof HR.canteenWeatherMult(1) === 'number', 'canteenWeatherMult returns a number');
  ok(HR.weatherDef('sunny').canteen > 1 && HR.weatherDef('rain').canteen < 1, 'sunny helps the canteen, rain hurts it');
  ok(HR.weatherDef('snow').feedExtra > 0 && HR.weatherDef('sunny').feedExtra === 0, 'only cold weather adds feed cost');
  // find a sunny and a snowy day deterministically and confirm the spread exists
  let sunnyD = null, snowD = null;
  for (let d = 1; d <= 400 && (sunnyD === null || snowD === null); d++) {
    const w = HR.weatherFor(d).id;
    if (w === 'sunny' && sunnyD === null) sunnyD = d;
    if (w === 'snow' && snowD === null) snowD = d;
  }
  ok(sunnyD !== null && snowD !== null, 'both sunny and snowy days occur over a season');
  ok(HR.feedExtraFor(snowD) > HR.feedExtraFor(sunnyD), 'snowy days demand more hay than sunny days');
  ok(HR.canteenWeatherMult(sunnyD) > HR.canteenWeatherMult(snowD), 'canteen does better in sun than snow');
}
{
  // weather feeds through advanceDay: a snowy day burns more hay than a sunny one
  let sunnyD = null, snowD = null;
  for (let d = 3; d <= 400 && (sunnyD === null || snowD === null); d++) {
    const w = HR.weatherFor(d).id;
    if (w === 'sunny' && sunnyD === null) sunnyD = d;
    if (w === 'snow' && snowD === null) snowD = d;
  }
  const gSun = HR.freshGame(); gSun.feed = 9999; gSun.day = sunnyD - 1; HR.advanceDay(gSun, rng(1));
  const gSnow = HR.freshGame(); gSnow.feed = 9999; gSnow.day = snowD - 1; HR.advanceDay(gSnow, rng(1));
  ok(gSnow.day === snowD && gSun.day === sunnyD, 'advanced onto the intended weather days');
  ok((9999 - gSnow.feed) > (9999 - gSun.feed), 'the same herd eats more hay on a snowy day');
}

// ---- coat colours (drives the drawn horses) ----
{
  // every phenotype the genetics can produce should map to a CSS colour
  ['Chestnut', 'Bay', 'Black', 'Palomino', 'Buckskin', 'Grey', 'Cremello', 'Perlino', 'Smoky Black', 'Smoky Cream', 'Golden', 'Pearl']
    .forEach(n => ok(HR.COAT_CSS[n] && HR.COAT_CSS[n].body, 'coat "' + n + '" has a body colour'));
  ok(HR.coatColor('Palomino').body !== HR.coatColor('Black').body, 'different coats render different colours');
  ok(HR.coatColor('not-a-coat').body, 'unknown coat falls back to a default colour');
}

// ---- audio model (pure bits; the audio graph itself is DOM-only) ----
{
  ok(HR.noteHz('A4') === 440 && HR.noteHz('C5') > HR.noteHz('C4'), 'note frequency table is sane');
  ok(HR.noteHz('not-a-note') === 440, 'unknown note falls back to A4');
  // every SFX references only defined notes and has a positive gain
  const ids = Object.keys(HR.SFX);
  ok(ids.length >= 5 && ids.includes('coin') && ids.includes('foal') && ids.includes('win'), 'a set of named cues exists');
  ok(ids.every(id => { const d = HR.sfxDef(id); return d && d.notes.length && d.gain > 0 && d.notes.every(n => HR.NOTE_HZ[n]); }),
    'every cue uses in-table notes and a positive gain');
  ok(HR.sfxDef('nope') === null, 'unknown cue id returns null');
  // settings reducer
  ok(HR.normAudio(undefined).on === false, 'audio defaults OFF (no autoplay)');
  ok(HR.normAudio(undefined).vol === 0.6, 'default volume is set');
  ok(HR.normAudio({ on: 'yes' }).on === false, 'only strict true counts as on');
  ok(HR.toggleAudio({ on: false, vol: 0.5 }).on === true, 'toggle flips off → on');
  ok(HR.toggleAudio({ on: true, vol: 0.5 }).on === false, 'toggle flips on → off');
  ok(HR.toggleAudio({ on: false, vol: 0.5 }).vol === 0.5, 'toggle preserves volume');
  ok(HR.setAudioVol({ on: true, vol: 0.5 }, 2).vol === 1 && HR.setAudioVol({ on: true, vol: 0.5 }, -1).vol === 0, 'volume is clamped 0..1');
  ok(HR.setAudioVol({ on: true, vol: 0.5 }, 0.3).on === true, 'setting volume preserves on/off');
}
{
  // a fresh game ships with audio off; save-load keeps it forward-compatible
  const g = HR.freshGame();
  ok(g.audio && g.audio.on === false && g.audio.vol === 0.6, 'fresh game has audio off by default');
}

// ---- aging & prime ----
{
  ok(HR.agePerformanceMult({ age: 20 }) === 1, 'young horses are at full performance');
  ok(HR.agePerformanceMult({ age: HR.PRIME_END }) === 1, 'still full at the end of prime');
  ok(HR.agePerformanceMult({ age: HR.OLD_AGE }) < 1, 'performance ebbs with old age');
  ok(HR.agePerformanceMult({ age: 200 }) >= 0.55, 'the age penalty has a floor');
  ok(HR.agePerformanceMult({ age: 50 }) > HR.agePerformanceMult({ age: 70 }), 'older = lower performance');
  ok(!HR.pastPrime({ age: 20 }) && HR.pastPrime({ age: HR.PRIME_END + 5 }), 'pastPrime tracks the prime cutoff');
  ok(!HR.isElderly({ age: 40 }) && HR.isElderly({ age: HR.OLD_AGE }), 'elderly starts at OLD_AGE');
  // old age blocks breeding and competing
  const old = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: HR.BREED_MAX + 2 });
  const stud = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20 });
  ok(HR.tooOldToBreed(old) && !HR.canBreed(old, stud).ok, 'a horse past BREED_MAX cannot breed');
  const elder = HR.mkHorse({ breed: 'arabian', age: HR.OLD_AGE + 1 });
  ok(HR.tooOldToCompete(elder) && !HR.canEnterShow(HR.freshGame(), elder).ok, 'a horse past OLD_AGE cannot compete');
  // an old horse scores lower in a discipline than an identical young one
  const base = { breed: 'quarter', speed: 80, stamina: 70, temperament: 70, health: 100, happy: 100, trait: 'steady' };
  const young = HR.mkHorse({ ...base, age: 20 }); const aged = HR.mkHorse({ ...base, age: HR.OLD_AGE });
  ok(HR.disciplineScore(aged, HR.disciplineDef('race')) < HR.disciplineScore(young, HR.disciplineDef('race')), 'age lowers competition score');
}

// ---- retirement & Hall of Fame ----
{
  const g = HR.freshGame();
  ok(Array.isArray(g.hallOfFame) && g.hallOfFame.length === 0 && g.prestige === 0, 'fresh game starts with an empty Hall of Fame');
  const champ = HR.mkHorse({ breed: 'friesian', age: 40, name: 'Legend', wins: 5, podiums: 8, coat: { name: 'Black', tier: 0 }, generation: 4 });
  g.horses.push(champ);
  ok(HR.canRetire(champ).ok, 'an adult can retire');
  ok(!HR.canRetire(HR.mkHorse({ breed: 'arabian', age: 2 })).ok, 'a foal cannot retire');
  const rec = HR.hofRecord(champ, 'retired', 40);
  ok(rec.name === 'Legend' && rec.wins === 5 && rec.breedName === 'Friesian', 'record captures the horse');
  ok(HR.isHofChampion(rec), 'a 5-win, gen-4 horse is a Hall-of-Fame champion');
  ok(HR.prestigeOf(rec) > HR.prestigeOf(HR.hofRecord(HR.mkHorse({ breed: 'shetland', age: 20 }), 'retired', 20)), 'a champion is worth more prestige than a plain horse');
  ok(typeof HR.legacyLine(rec) === 'string' && HR.legacyLine(rec).includes('champion'), 'legacy line reads well');
  // retire mutates the game: horse leaves, HoF grows, prestige + rep rise
  const n0 = g.horses.length, rep0 = g.rep;
  const res = HR.retireHorse(g, champ, 40);
  ok(g.horses.length === n0 - 1, 'retired horse leaves the active herd (frees a stall)');
  ok(g.hallOfFame.length === 1 && g.hallOfFame[0].name === 'Legend', 'inducted into the Hall of Fame');
  ok(g.prestige === res.prestige && res.prestige > 0, 'estate prestige recorded');
  ok(g.rep > rep0, 'honouring a great horse lifts reputation');
}
{
  // the very old can pass peacefully into the Hall of Fame via advanceDay
  const g = HR.freshGame(); g.feed = 9999;
  g.horses.forEach(h => h.age = HR.LIFESPAN + 5);
  let passedSomeone = false;
  for (let i = 0; i < 60 && !passedSomeone; i++) { HR.advanceDay(g, rng(i + 1)); if (g.hallOfFame.length > 0) passedSomeone = true; }
  ok(passedSomeone, 'a very old horse eventually passes into the Hall of Fame');
  ok(g.hallOfFame.every(r => r.reason === 'passed' || r.reason === 'retired'), 'Hall records carry a reason');
}

// ---- stud farm / stud fees ----
{
  const g = HR.freshGame(); g.rep = 500;
  const stud = HR.mkHorse({ breed: 'friesian', sex: 'stallion', age: 20, speed: 90, stamina: 85, temperament: 85, wins: 4, coat: { name: 'Black', tier: 0 }, generation: 3 });
  const mare = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20 });
  const foal = HR.mkHorse({ breed: 'arabian', age: 2, sex: 'stallion' });
  ok(HR.canStand(stud).ok, 'an adult stallion can stand at stud');
  ok(!HR.canStand(mare).ok, 'a mare cannot stand at stud');
  ok(!HR.canStand(foal).ok, 'a foal cannot stand at stud');
  ok(!HR.canStand(HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: HR.BREED_MAX + 2 })).ok, 'too-old stallions cannot stand at stud');
  // fee scales with quality and reputation
  const plain = HR.mkHorse({ breed: 'shetland', sex: 'stallion', age: 20, speed: 30, stamina: 40, temperament: 50 });
  ok(HR.studFee(g, stud) > HR.studFee(g, plain), 'a better stallion commands a higher stud fee');
  const gRich = HR.freshGame(); gRich.rep = 5000;
  ok(HR.studFee(gRich, stud) > HR.studFee(g, stud), 'reputation raises the stud fee');
  // demand: spring is busier than winter
  const gSpring = HR.freshGame(); gSpring.rep = 500; gSpring.day = 3;
  const gWinter = HR.freshGame(); gWinter.rep = 500; gWinter.day = HR.SEASON_LEN * 3 + 3;
  ok(HR.studDemand(gSpring, stud) > HR.studDemand(gWinter, stud), 'spring brings more visiting mares');
}
{
  // standing at stud earns income through advanceDay and blocks competing
  const g = HR.freshGame(); g.feed = 9999; g.rep = 800; g.day = 3;
  const stud = HR.mkHorse({ breed: 'friesian', sex: 'stallion', age: 20, speed: 90, stamina: 85, temperament: 85, wins: 3, atStud: true });
  g.horses.push(stud);
  ok(HR.studStallions(g).length === 1 && HR.studIncome(g) > 0, 'an at-stud stallion produces stud income');
  ok(!HR.canEnterShow(g, stud).ok, 'a stallion at stud cannot compete that day');
  const m0 = g.money;
  HR.advanceDay(g, rng(3));
  ok(g.money > m0 && g.stats.studIncome > 0, 'stud fees are collected and logged each day');
  // not at stud → no stud income
  const g2 = HR.freshGame(); g2.horses.push(HR.mkHorse({ breed: 'friesian', sex: 'stallion', age: 20 }));
  ok(HR.studIncome(g2) === 0, 'a stallion not standing at stud earns nothing');
}

// ---- clamp helper ----
ok(HR.clamp(150, 0, 100) === 100 && HR.clamp(-5, 0, 100) === 0 && HR.clamp(50, 0, 100) === 50, 'clamp bounds values');

console.log(`horse_ranch: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
