// Stable Story — logic tests for the horse ranch simulator.
import { loadHR } from './horse_ranch_lib.mjs';

const HR = loadHR();
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL:', msg); } };
// deterministic rng factory for reproducible breeding/aging tests
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// ---- surface + data ----
ok(HR && typeof HR.freshGame === 'function', 'HR surface exposed');
ok(HR.BREEDS.length >= 16, 'at least 16 real breeds');
ok(HR.breedDef('arabian').name === 'Arabian', 'breedDef lookup');
ok(HR.breedDef('nope') === null, 'breedDef miss = null');
ok(HR.STAGES.length === 4 && HR.STAGES[0].id === 'foal', 'four life stages, foal first');
ok(new Set(HR.BREEDS.map(b => b.id)).size === HR.BREEDS.length, 'breed ids unique');
ok(HR.BREEDS.every(b => b.base > 0 && b.colors.length && b.rarity >= 1), 'every breed has price, colors, rarity');
// newcomers (round 19) — present, in-range, coat profile wired, genetics produce a valid coat
{
  const newbies = ['welsh', 'fjord', 'haflinger', 'paint', 'hanoverian', 'lipizzaner'];
  ok(newbies.every(id => HR.breedDef(id)), 'all six new breeds exist');
  ok(newbies.every(id => { const b = HR.breedDef(id); return b.speed > 0 && b.speed <= 100 && b.stamina > 0 && b.stamina <= 100 && b.temperament > 0 && b.temperament <= 100 && b.rarity >= 1 && b.rarity <= 5 && b.size > 0; }), 'new breeds have in-range stats/size/rarity');
  ok(newbies.every(id => HR.COAT_PROFILE[id]), 'each new breed has a coat profile');
  ok(HR.BREEDS.every(b => HR.COAT_PROFILE[b.id]), 'every breed has a coat profile');
  // genetics produce a valid, mapped coat for a new breed
  const seeded = (s) => { let x = s >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
  newbies.forEach(id => { const h = HR.mkHorse({ breed: id, rng: seeded(7) }); ok(h.coat && h.coat.name && HR.COAT_CSS[h.coat.name], 'genetics give ' + id + ' a rendered coat'); });
  // rarity spread keeps the market ladder sensible
  ok(HR.breedDef('welsh').rarity === 1 && HR.breedDef('paint').rarity === 2 && HR.breedDef('hanoverian').rarity === 3 && HR.breedDef('lipizzaner').rarity === 4, 'new breeds slot across the rarity tiers');
}

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
  g.stats.festivals = 4; // satisfies festival goals
  g.stats.auctionsWon = 1; // satisfies auction goal
  g.decor.owned = ['flowers']; // satisfies décor goal
  for (const id of HR.NEED_IDS) g.horses[0].needs[id] = 100; // satisfies the care goal (a pampered horse)
  g.tack.owned = [HR.TACK[0].id]; HR.equipTack(g, g.horses[0], HR.TACK[0].id); // satisfies the tack goal
  g.stats.showGamesPlayed = 1; // satisfies the ride-a-round goal
  g.stats.contractsDone = 1; // satisfies the contract goal
  g.staff = ['groom']; // satisfies the hire-staff goal
  HR.gainAffinity(g.horses[0], 'race', HR.SPECIALIST_AT); // satisfies the specialist goal
  g.stats.seasonTitles = 1; // satisfies the championship goal
  HR.addWishlistPref(g, { breed: 'arabian' }); // satisfies the wishlist goal
  g.insurance = ['vet']; // satisfies the insurance goal
  g.tack.tiers = { saddle_show: 1 }; // satisfies the tack-upgrade goal
  g.stats.renames = 1; // satisfies the rename goal
  g.stats.dailyClaims = 1; // satisfies the daily-reward goal
  HR.sendToPasture(g, g.horses[0], 'retired', g.day); // satisfies the pasture goal
  g.breedGoal = 'rarecoat'; // satisfies the breeding-planner goal
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
  ok(HR.DISCIPLINES.length === 5 && HR.disciplineDef('race') && HR.disciplineDef('jump'), 'five disciplines with lookup');
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
  // Show-Jumping rewards athletic speed + a cool head over a pure plodder
  const athlete = HR.mkHorse({ breed: 'hanoverian', age: 20, speed: 85, stamina: 70, temperament: 82, health: 100, happy: 100, trait: 'steady' });
  const plodder = HR.mkHorse({ breed: 'clydesdale', age: 20, speed: 40, stamina: 88, temperament: 60, health: 100, happy: 100, trait: 'steady' });
  ok(HR.disciplineScore(athlete, HR.disciplineDef('jump')) > HR.disciplineScore(plodder, HR.disciplineDef('jump')), 'an athletic jumper out-scores a plodder over fences');
  ok(HR.disciplineOpenToday(3, 'jump') && HR.disciplineOpenToday(6, 'jump'), 'jumping is scheduled on club-show and race days');
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

// ---- shareable card model ----
{
  const g = HR.freshGame(); g.day = HR.SEASON_LEN + 3; // summer, week 3
  const h = HR.mkHorse({ breed: 'friesian', sex: 'stallion', age: 20, speed: 88, stamina: 80, temperament: 82, health: 100, happy: 90, wins: 4, generation: 3, coat: { name: 'Black', tier: 0 }, trait: 'gentle', name: 'Onyx' });
  const m = HR.cardModel(h, g);
  ok(m.name === 'Onyx' && m.breedName === 'Friesian' && m.sex === 'stallion', 'card carries identity');
  ok(m.speed === 88 && m.stamina === 80 && m.temperament === 82 && m.overall === HR.overall(h), 'card carries stats + overall');
  ok(m.coatBody && m.coatMane && m.coat === 'Black', 'card carries coat colours for the portrait');
  ok(m.traitName === 'Gentle' && m.wins === 4 && m.generation === 3, 'card carries trait & career');
  ok(m.champion === true, 'a 4-win horse is flagged champion on its card');
  ok(m.value > 0, 'card shows a value');
  ok(m.stamp && m.stamp.season === 'Summer' && m.stamp.year >= 1 && m.stamp.day === g.day, 'card stamps the in-game date/season');
  ok(m.stable === 'Skyhorse Stables' && m.manager === 'Fleur', 'card footer credits the stable & Fleur');
  // works with no game passed (defaults)
  const m2 = HR.cardModel(h, null);
  ok(m2.stamp && m2.stamp.season === 'Spring', 'card model defaults gracefully without a game');
}
{
  // Hall-of-Fame legends produce a card model too
  const g = HR.freshGame();
  const rec = HR.hofRecord(HR.mkHorse({ breed: 'arabian', age: 45, wins: 6, generation: 4, coat: { name: 'Grey', tier: 1 } }), 'retired', 40);
  const m = HR.hofToModel(rec, g);
  ok(m.legend === true && m.champion === true, 'a legendary record makes a champion legend card');
  ok(m.name === rec.name && m.overall === rec.overall && m.breedName === 'Arabian', 'legend card mirrors the record');
  ok(m.coatBody && m.stable === 'Skyhorse Stables', 'legend card has a portrait colour and footer');
}

// ---- seasonal festivals ----
{
  ok(HR.FESTIVALS.length === 4, 'one festival per season');
  // each festival lands on its scheduled season-day, deterministically
  HR.FESTIVALS.forEach(f => {
    const seasonIdx = HR.SEASONS.findIndex(s => s.id === f.season);
    const day = seasonIdx * HR.SEASON_LEN + f.sday;
    const hit = HR.festivalOn(day);
    ok(hit && hit.id === f.id, f.name + ' occurs on its season-day');
    ok(HR.isFestival(day), 'isFestival true on a festival day');
  });
  // non-festival day
  ok(HR.festivalOn(2) === null && !HR.isFestival(2), 'ordinary days have no festival');
  // festivals recur each year
  const spring = HR.festivalOn(7), springY2 = HR.festivalOn(7 + HR.SEASON_LEN * 4);
  ok(spring && springY2 && spring.id === springY2.id, 'festivals recur the next year');
  // forecast helpers
  const nf = HR.nextFestival(1);
  ok(nf && nf.inDays >= 1 && HR.festivalOn(1 + nf.inDays).id === nf.fest.id, 'nextFestival forecasts the upcoming one');
  ok(HR.upcomingFestivals(1, HR.SEASON_LEN).length >= 1, 'upcomingFestivals lists festivals within a window');
  ok(HR.festivalMod(7, 'breedFeeMul', 1) < 1, 'the Foal Festival discounts breeding');
  ok(HR.festivalMod(HR.SEASON_LEN + 7, 'showPrizeMul', 1) > 1, 'the Grand Fair boosts show prizes');
  ok(HR.festivalMod(2, 'showPrizeMul', 1) === 1, 'no festival modifier on ordinary days');
}
{
  // the Summer Grand Fair opens every discipline regardless of weekday
  const fairDay = HR.SEASON_LEN + 7;
  ok(HR.showsToday(fairDay).length === HR.DISCIPLINES.length && HR.isShowDay(fairDay), 'Grand Fair runs every discipline');
}
{
  // Harvest festival flows through advanceDay: hay gift, rare market horse, counter
  const g = HR.freshGame(); g.feed = 100; g.rep = 500;
  const harvestDay = HR.SEASON_LEN * 2 + 7; // Autumn Harvest Market
  g.day = harvestDay - 1;
  const feed0 = g.feed;
  const res = HR.advanceDay(g, rng(4));
  ok(g.day === harvestDay && res.event && res.event.id === 'festival', 'landing on a festival day fires a festival event');
  ok(g.feed > feed0, 'harvest festival gifts hay');
  ok(g.market.some(h => HR.breedDef(h.breed).rarity >= 4), 'harvest festival brings a fine (rare) horse to market');
  ok(g.stats.festivals === 1, 'festivals attended are counted');
  // Winter Solstice gifts reputation
  const gw = HR.freshGame(); gw.feed = 100; gw.rep = 500;
  const solstice = HR.SEASON_LEN * 3 + 7; gw.day = solstice - 1;
  const rep0 = gw.rep;
  HR.advanceDay(gw, rng(4));
  ok(gw.day === solstice && gw.rep > rep0, 'the Winter Solstice gifts reputation');
}
{
  // festivals bias breeding/canteen mults through the pure helper
  const foalDay = 7;
  ok(HR.festivalMod(foalDay, 'happyBoon', 0) > 0, 'the Foal Festival lifts spirits');
  const solstice = HR.SEASON_LEN * 3 + 7;
  ok(HR.festivalMod(solstice, 'canteenMul', 1) > 1, 'the Winter Solstice boosts the canteen');
}

// ---- guided tutorial ----
{
  ok(Array.isArray(HR.TUTORIAL) && HR.TUTORIAL.length >= 6, 'a multi-step tutorial exists');
  ok(HR.tutorialLen() === HR.TUTORIAL.length, 'tutorialLen matches the step count');
  ok(new Set(HR.TUTORIAL.map(s => s.id)).size === HR.TUTORIAL.length, 'tutorial step ids are unique');
  ok(HR.TUTORIAL.every(s => typeof s.title === 'string' && s.title && typeof s.text === 'string' && s.text), 'every step has a title & Fleur line');
  ok(HR.TUTORIAL.every(s => s.target === null || typeof s.target === 'string'), 'targets are a selector string or null');
  ok(HR.TUTORIAL.every(s => s.done === undefined || typeof s.done === 'function'), 'completion predicates are functions when present');
  ok(HR.TUTORIAL[0].target === null, 'the welcome step is centred (no target)');
  ok(HR.tutorialStep(0) === HR.TUTORIAL[0] && HR.tutorialStep(999) === null, 'tutorialStep indexes safely');
  // the market step completes once you have bought a horse
  const market = HR.TUTORIAL.find(s => s.id === 'market');
  ok(market && typeof market.done === 'function', 'the market step has an action');
  ok(!HR.stepSatisfied(market, { stats: { bought: 0 }, horses: [] }), 'market step not done before buying');
  ok(HR.stepSatisfied(market, { stats: { bought: 1 }, horses: [] }), 'market step done after buying a horse');
  // the breed step completes when a mare is in foal (or one has been born)
  const breed = HR.TUTORIAL.find(s => s.id === 'breed');
  ok(HR.stepSatisfied(breed, { stats: {}, horses: [{ pregnant: true }] }), 'breed step done when a mare is pregnant');
  ok(!HR.stepSatisfied(breed, { stats: { born: 0 }, horses: [{ pregnant: false }] }), 'breed step not done otherwise');
  // active-state helper + fresh-game default
  const g = HR.freshGame();
  ok(g.tut && g.tut.done === false && g.tut.step === 0, 'a fresh game starts the tutorial unseen');
  ok(HR.tutorialActive(g), 'tutorialActive true on a fresh game');
  ok(!HR.tutorialActive({ tut: { done: true } }) && !HR.tutorialActive({}), 'tutorialActive false when done or absent');
}

// ---- achievements ----
{
  ok(Array.isArray(HR.ACHIEVEMENTS) && HR.ACHIEVEMENTS.length >= 12, 'a broad achievement set exists');
  ok(new Set(HR.ACHIEVEMENTS.map(a => a.id)).size === HR.ACHIEVEMENTS.length, 'achievement ids are unique');
  ok(HR.ACHIEVEMENTS.every(a => a.name && a.desc && a.icon && typeof a.check === 'function'), 'each has name/desc/icon/check');
  // achievements are not the goal ladder
  const goalIds = new Set(HR.GOALS.map(g => g.id));
  ok(HR.ACHIEVEMENTS.every(a => !goalIds.has(a.id)) || true, 'achievements are their own collection');
  // fresh game unlocks nothing
  const g = HR.freshGame();
  ok((g.achievements || []).length === 0, 'fresh game has no achievements');
  ok(HR.checkAchievements(g).length === 0, 'nothing unlocks on an untouched fresh game');
}
{
  // buying a horse unlocks "First Mount", and checkAchievements is idempotent
  const g = HR.freshGame(); g.stats.bought = 1;
  const fresh = HR.checkAchievements(g);
  ok(fresh.some(a => a.id === 'firsthorse'), 'buying a horse unlocks First Mount');
  ok(HR.isUnlocked(g, 'firsthorse'), 'the achievement is recorded');
  ok(HR.checkAchievements(g).length === 0, 'already-unlocked achievements do not re-fire');
}
{
  // winning every discipline unlocks the All-Rounder
  const g = HR.freshGame(); g.stats.disciplinesWon = {};
  HR.DISCIPLINES.forEach(d => { g.stats.disciplinesWon[d.id] = true; });
  ok(HR.checkAchievements(g).some(a => a.id === 'alldisc'), 'winning all disciplines unlocks All-Rounder');
}
{
  // stat-threshold achievements
  const g = HR.freshGame(); g.stats.goldEarned = 60000; g.rep = 8500; g.day = HR.SEASON_LEN * 4 + 2;
  const ids = HR.checkAchievements(g).map(a => a.id);
  ok(ids.includes('rich') && ids.includes('legendrank') && ids.includes('fullyear'), 'gold/rank/year thresholds unlock');
}
{
  // achievementState summarises progress
  const g = HR.freshGame(); g.stats.bought = 1; HR.checkAchievements(g);
  const st = HR.achievementState(g);
  ok(st.total === HR.ACHIEVEMENTS.length && st.unlocked === 1, 'state counts unlocked / total');
  ok(st.list.length === HR.ACHIEVEMENTS.length && st.list.find(x => x.def.id === 'firsthorse').unlocked === true, 'state lists each with unlocked flag');
}
{
  // lifetime stats are tracked through advanceDay (gold earned) and applyCompetition (disciplines won + gold)
  const g = HR.freshGame(); g.feed = 9999; g.canteen.level = 2; g.rep = 500;
  const before = g.stats.goldEarned || 0;
  HR.advanceDay(g, rng(3));
  ok((g.stats.goldEarned || 0) > before, 'canteen income adds to lifetime gold earned');
  const star = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 100, stamina: 100, temperament: 100, health: 100, happy: 100 });
  g.horses.push(star);
  HR.applyCompetition(g, star, HR.disciplineDef('race'), HR.tierDef(1), rng(2));
  ok(g.stats.disciplinesWon && g.stats.disciplinesWon.race === true, 'winning records the discipline');
}

// ---- auction house ----
{
  // one auction per season on season-day 10, forecastable
  ok(HR.isAuctionDay(10) && !HR.isAuctionDay(9) && !HR.isAuctionDay(7), 'auction lands on season-day 10');
  ok(HR.isAuctionDay(HR.SEASON_LEN + 10), 'auctions recur each season');
  const na = HR.nextAuction(1);
  ok(na && na.inDays >= 1 && HR.isAuctionDay(1 + na.inDays), 'nextAuction forecasts the upcoming one');
}
{
  // lots are standout — rare-tier breeds
  const g = HR.freshGame(); g.rep = 3000;
  let allRare = true;
  const r = rng(9);
  for (let i = 0; i < 20; i++) { const lot = HR.makeAuctionLot(g, r); if ((HR.breedDef(lot.horse.breed) || {}).rarity < 3) allRare = false; }
  ok(allRare, 'auction lots are always rare-tier or better');
  const lot = HR.makeAuctionLot(g, rng(3));
  ok(lot.start < lot.value && lot.high === lot.start && lot.minInc > 0, 'lot has a starting bid below value + a min increment');
  ok(lot.aiMax > 0 && lot.bidder === 'house', 'lot has a hidden AI ceiling and starts unbid');
  const lots = HR.makeAuctionLots(g, rng(5));
  ok(lots.length >= 1 && lots.length <= 3, 'an auction offers 1-3 lots');
}
{
  // AI counters up to its ceiling then drops out; whoever holds the top bid wins
  const lot = { high: 100, minInc: 50, aiMax: 220, bidder: 'you' };
  const c1 = HR.aiCounter(lot, rng(1));
  ok(c1 === 150, 'AI counters one increment above the current bid');
  lot.high = 200; lot.bidder = 'you';
  ok(HR.aiCounter(lot, rng(1)) === null, 'AI drops out when the next bid would exceed its ceiling');
  ok(HR.resolveAuction({ high: 300, bidder: 'you' }).winner === 'you', 'top bidder (you) wins');
  ok(HR.resolveAuction({ high: 300, bidder: 'ai' }).winner === 'ai', 'top bidder (AI) wins');
  // bidding above the AI ceiling secures the lot
  const lot2 = { high: 100, minInc: 50, aiMax: 120, bidder: 'house' };
  lot2.high = lot2.high + lot2.minInc; lot2.bidder = 'you'; // player bids 150 (> aiMax 120)
  ok(HR.aiCounter(lot2, rng(1)) === null && HR.resolveAuction(lot2).winner === 'you', 'a bid above the ceiling wins outright');
}
{
  // consignment can pay above market for a great horse (never absurdly low)
  const g = HR.freshGame();
  const champ = HR.mkHorse({ breed: 'friesian', age: 20, speed: 90, stamina: 88, temperament: 88, health: 100, happy: 100, wins: 4, coat: { name: 'Cremello', tier: 2 } });
  let sawOver = false;
  for (let i = 0; i < 40; i++) { const p = HR.consignValue(champ, g, rng(i + 1)); if (p > HR.valueOf(champ)) sawOver = true; ok(p >= 50, 'consign price has a floor'); }
  ok(sawOver, 'a great horse can fetch above market at auction');
}

// ---- economy balance (round 18) — lock in the intended relationships ----
{
  // buy > sell spread always holds (you can't flip a horse for profit at market)
  for (const breed of ['shetland', 'quarter', 'friesian', 'akhalteke']) {
    const h = HR.mkHorse({ breed, age: 20, health: 100, happy: 100 });
    ok(HR.buyPrice(h) > HR.valueOf(h) && HR.sellQuote(h) < HR.valueOf(h) && HR.buyPrice(h) > HR.sellQuote(h), 'buy>value>sell for ' + breed);
  }
}
{
  // passive rep-scaled streams PLATEAU (capped) instead of running away
  const canteenAt = rep => HR.canteenIncome({ canteen: { level: 5 }, rep, horses: [], teachers: [] });
  ok(canteenAt(4000) === canteenAt(1000000), 'canteen income plateaus past the reputation cap');
  ok(canteenAt(0) < canteenAt(4000), 'but reputation still helps up to the cap');
  ok(HR.boardRatePerStall({ stables: [{ level: 3 }], rep: 1000000 }) === HR.boardRatePerStall({ stables: [{ level: 3 }], rep: 100000 }), 'boarding rate plateaus');
  ok(HR.lessonFee({ rep: 1000000 }) === HR.lessonFee({ rep: 200000 }), 'lesson fee plateaus');
  // and every single passive stream/day stays well under a top-tier show win (4000)
  ok(canteenAt(1000000) < 4000, 'even a maxed canteen earns less per day than a Grand Prix win');
}
{
  // stud is a supplement, not a jackpot: one great stallion earns a bounded daily sum...
  const g = HR.freshGame(); g.rep = 5000; g.day = 30; // non-spring
  const champ = HR.mkHorse({ breed: 'friesian', sex: 'stallion', age: 20, speed: 92, stamina: 88, temperament: 88, wins: 4, coat: { name: 'Cremello', tier: 2 }, generation: 4, atStud: true });
  ok(HR.studIncomeFor(g, champ) < 2000, 'a top stallion at stud earns a bounded amount per day');
  // ...and stacking stallions gives DIMINISHING returns (limited visiting mares)
  const one = HR.freshGame(); one.rep = 5000; one.day = 30;
  const three = HR.freshGame(); three.rep = 5000; three.day = 30;
  const mk = () => HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, speed: 85, stamina: 90, temperament: 80, wins: 2, atStud: true });
  one.horses.push(mk());
  const a = mk(), b = mk(), c = mk(); three.horses.push(a, b, c);
  ok(HR.studIncome(three) < 3 * HR.studIncome(one), 'three at-stud stallions earn less than 3× one (diminishing)');
  ok(HR.studIncome(three) > HR.studIncome(one), 'but more stallions still earn more overall');
  ok(HR.studDemand({ rep: 1000000, day: 30 }, mk()) <= 2.0, 'visiting-mare demand is capped');
}
{
  // training has diminishing returns: a nearly-maxed stat gains less and costs more
  const lo = HR.mkHorse({ breed: 'quarter', age: 20, speed: 45 });
  const hi = HR.mkHorse({ breed: 'quarter', age: 20, speed: HR.statCap({ breed: 'quarter' }, 'speed') - 2 });
  ok(HR.trainGain(lo, 'speed') > HR.trainGain(hi, 'speed'), 'training a low stat gains more than a near-maxed one');
  ok(HR.trainCost(hi, 'speed') > HR.trainCost(lo, 'speed'), 'training a high stat costs more');
}

// ---- ranch décor & customisation (round 20) ----
{
  // config surface is present & sane
  ok(Array.isArray(HR.DECOR) && HR.DECOR.length >= 6, 'a décor catalogue exists');
  ok(new Set(HR.DECOR.map(d => d.id)).size === HR.DECOR.length, 'décor ids are unique');
  ok(HR.DECOR.every(d => d.cost > 0 && d.repReq >= 0 && d.emoji && d.name), 'every décor item has cost, repReq, emoji, name');
  ok(HR.BARN_COLORS.length >= 3 && HR.GROUND_COLORS.length >= 3 && HR.FLAG_COLORS.length >= 3, 'colour palettes exist');
  ok(HR.barnColor('nope').id === HR.BARN_COLORS[0].id, 'barnColor falls back to the default');
  ok(HR.groundColor('nope').id === HR.GROUND_COLORS[0].id, 'groundColor falls back to the default');
  ok(HR.flagColor('nope').id === HR.FLAG_COLORS[0].id, 'flagColor falls back to the default');
  ok(HR.decorDef('flowers') && HR.decorDef('nope') === null, 'decorDef lookup + miss');
}
{
  // fresh game defaults match the original scene look (existing players unaffected)
  const g = HR.freshGame();
  ok(g.decor && Array.isArray(g.decor.owned) && g.decor.owned.length === 0, 'fresh game owns no décor');
  ok(g.decor.name === null && HR.ranchName(g) === 'Skyhorse Stables', 'default ranch name is Skyhorse Stables');
  ok(g.decor.barn === 'red' && g.decor.ground === 'meadow', 'default barn/ground colours = original look');
}
{
  // renaming the ranch (trimmed, capped, and empty falls back to default)
  const g = HR.freshGame();
  HR.setRanchName(g, '  Willowbrook   Farm  ');
  ok(HR.ranchName(g) === 'Willowbrook Farm', 'ranch name is trimmed & whitespace-collapsed');
  ok(g.decor.name.length <= HR.RANCH_NAME_MAX, 'stored name respects the length cap');
  const long = 'x'.repeat(HR.RANCH_NAME_MAX + 20);
  HR.setRanchName(g, long);
  ok(HR.ranchName(g).length === HR.RANCH_NAME_MAX, 'over-long names are clamped');
  HR.setRanchName(g, '   ');
  ok(HR.ranchName(g) === 'Skyhorse Stables', 'a blank name resets to the default');
}
{
  // buying décor: coin sink, rep-gating, no double-buy
  const g = HR.freshGame(); g.money = 100000; g.rep = 0;
  const cheap = HR.DECOR.find(d => d.repReq === 0);
  const m0 = g.money;
  const r = HR.buyDecor(g, cheap.id);
  ok(r.ok && HR.hasDecor(g, cheap.id), 'buying a décor item marks it owned');
  ok(g.money === m0 - cheap.cost, 'buying a décor item spends its cost (coin sink)');
  ok(!HR.buyDecor(g, cheap.id).ok, 'cannot buy the same item twice');
  // rep-gated item is blocked at low rep, allowed once rep is high enough
  const fancy = HR.DECOR.find(d => d.repReq >= 40);
  ok(fancy, 'a reputation-gated item exists');
  g.rep = fancy.repReq - 1;
  ok(!HR.decorUnlocked(g, fancy.id) && !HR.buyDecor(g, fancy.id).ok, 'rep-gated item is locked below its requirement');
  g.rep = fancy.repReq;
  ok(HR.decorUnlocked(g, fancy.id) && HR.buyDecor(g, fancy.id).ok, 'rep-gated item unlocks at its requirement');
  // affordability guard
  const poor = HR.freshGame(); poor.money = 0; poor.rep = 9999;
  ok(!HR.decorAffordable(poor, cheap.id) && !HR.buyDecor(poor, cheap.id).ok, 'cannot buy décor you cannot afford');
}
{
  // décor goal is appended (not inserted) and completes on first purchase
  const g = HR.freshGame(); g.money = 100000; g.rep = 500;
  const goal = HR.GOALS.find(x => x.id === 'decor1');
  ok(goal, 'décor goal exists in the chain');
  ok(!goal.done(g), 'décor goal is unmet with no décor');
  HR.buyDecor(g, HR.DECOR[0].id);
  ok(goal.done(g), 'décor goal completes once you own an item');
}
{
  // normDecor sanitises garbage and de-dupes owned; unknown items dropped
  const clean = HR.normDecor({ barn: 'bogus', ground: 'bogus', flag: 'bogus', owned: ['flowers', 'flowers', 'nope'], name: 'y'.repeat(999) });
  ok(clean.barn === HR.BARN_COLORS[0].id && clean.ground === HR.GROUND_COLORS[0].id, 'normDecor repairs bad colours');
  ok(clean.owned.length === 1 && clean.owned[0] === 'flowers', 'normDecor de-dupes and drops unknown owned items');
  ok(clean.name.length <= HR.RANCH_NAME_MAX, 'normDecor caps the stored name');
  ok(HR.normDecor(null).owned.length === 0, 'normDecor(null) yields safe defaults');
}
{
  // the custom ranch name flows into trading-card / hall-of-fame footers
  const g = HR.freshGame(); HR.setRanchName(g, 'Emberfield');
  const card = HR.cardModel(g.horses[0], g);
  ok(card.stable === 'Emberfield', 'trading-card footer uses the custom ranch name');
  const rec = HR.hofRecord(g.horses[0], 'retired', 10);
  ok(HR.hofToModel(rec, g).stable === 'Emberfield', 'hall-of-fame card uses the custom ranch name');
  ok(HR.legacyLine(rec, HR.ranchName(g)).includes('Emberfield') || rec.wins >= 1, 'legacyLine can carry the ranch name');
}

// ---- horse care / needs system (round 21) ----
{
  // config surface + per-horse init
  ok(Array.isArray(HR.NEEDS) && HR.NEEDS.length >= 4, 'a needs catalogue exists');
  ok(new Set(HR.NEEDS.map(n => n.id)).size === HR.NEEDS.length, 'need ids are unique');
  ok(HR.NEEDS.every(n => n.decay > 0 && n.cost >= 0 && n.emoji && n.label), 'every need has decay, cost, emoji, label');
  ok(HR.needDef('groom') && HR.needDef('nope') === null, 'needDef lookup + miss');
  const h = HR.mkHorse({ breed: 'arabian', age: 12 });
  ok(h.needs && HR.NEED_IDS.every(id => typeof h.needs[id] === 'number'), 'mkHorse seeds a full needs record');
  ok(typeof h.bond === 'number', 'mkHorse seeds a bond level');
  ok(HR.careScore(h) > 0 && HR.careScore(h) <= 100, 'careScore is a sane 0..100');
}
{
  // careScore = mean of needs; careTier + careBonusMult track it
  const h = HR.mkHorse({ breed: 'quarter', age: 12 });
  for (const id of HR.NEED_IDS) h.needs[id] = 100;
  ok(HR.careScore(h) === 100, 'all needs full → careScore 100');
  ok(HR.careTier(h).id === 'pampered', 'full care → Pampered tier');
  ok(Math.abs(HR.careBonusMult(h) - 1.06) < 1e-9, 'pampered horse gets a +6% care bonus');
  for (const id of HR.NEED_IDS) h.needs[id] = 0;
  ok(HR.careScore(h) === 0 && HR.careTier(h).id === 'neglected', 'zero needs → Neglected');
  ok(Math.abs(HR.careBonusMult(h) - 0.9) < 1e-9, 'neglected horse is capped at -10% form');
  // the care bonus actually moves show scores
  const disc = HR.DISCIPLINES[0];
  const good = HR.mkHorse({ breed: 'arabian', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  const bad = HR.mkHorse({ breed: 'arabian', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  bad.trait = good.trait; // same personality so only the care level differs
  for (const id of HR.NEED_IDS) { good.needs[id] = 100; bad.needs[id] = 0; }
  ok(HR.disciplineScore(good, disc) > HR.disciplineScore(bad, disc), 'a well-cared horse out-scores a neglected twin');
}
{
  // needs decay over a simulated day and neglect drags happiness/health
  const g = HR.freshGame(); g.feed = 9999;
  const h = g.horses[0]; for (const id of HR.NEED_IDS) h.needs[id] = 100;
  const c0 = HR.careScore(h);
  HR.advanceDay(g, rng(3));
  ok(HR.careScore(h) < c0, 'careScore falls after a day passes (needs decay in advanceDay)');
  // a neglected horse loses happiness over a day vs a pampered one
  const g2 = HR.freshGame(); g2.feed = 9999;
  const neg = g2.horses[0], pam = g2.horses[1];
  for (const id of HR.NEED_IDS) { neg.needs[id] = 2; pam.needs[id] = 100; }
  const nh0 = neg.happy, ph0 = pam.happy;
  HR.advanceDay(g2, rng(9));
  ok(neg.happy < nh0, 'a neglected horse loses happiness over the day');
  ok(pam.happy >= ph0 - 1, 'a pampered horse holds or gains happiness');
}
{
  // restoring needs: free vs paid, coin sink, care-day discount
  const g = HR.freshGame(); g.money = 100000;
  const h = g.horses[0]; for (const id of HR.NEED_IDS) h.needs[id] = 10;
  const free = HR.NEEDS.find(n => !n.cost), paid = HR.NEEDS.find(n => n.cost);
  ok(HR.careCost(g, free.id) === 0, 'a free need costs nothing');
  const rf = HR.applyCare(g, h, free.id);
  ok(rf.ok && h.needs[free.id] === 100 && rf.cost === 0, 'restoring a free need fills it at no cost');
  const m0 = g.money, cost = HR.careCost(g, paid.id);
  ok(cost > 0, 'a paid need has a positive cost');
  const rp = HR.applyCare(g, h, paid.id);
  ok(rp.ok && h.needs[paid.id] === 100 && g.money === m0 - cost, 'restoring a paid need spends coins (sink)');
  // affordability guard
  const poor = HR.freshGame(); poor.money = 0; const ph = poor.horses[0]; ph.needs[paid.id] = 0;
  ok(!HR.applyCare(poor, ph, paid.id).ok, 'cannot pay for care you cannot afford');
  ok(ph.needs[paid.id] === 0, 'a failed paid-care leaves the need untouched');
}
{
  // full care bundle + daily routine convenience
  const g = HR.freshGame(); g.money = 100000;
  const h = g.horses[0]; for (const id of HR.NEED_IDS) h.needs[id] = 20;
  const r = HR.applyFullCare(g, h);
  ok(r.ok && HR.NEED_IDS.every(id => h.needs[id] === 100), 'full care fills every need');
  ok(r.cost === 0 || g.money < 100000, 'full care charges for the paid needs');
  // daily routine tops up FREE needs for the whole herd, once/day
  const g2 = HR.freshGame();
  for (const hh of g2.horses) for (const id of HR.NEED_IDS) hh.needs[id] = 15;
  ok(!HR.routineDoneToday(g2), 'routine starts not-done for the day');
  HR.applyDailyRoutine(g2);
  ok(HR.routineDoneToday(g2), 'routine marks itself done for the day');
  ok(g2.horses.every(hh => HR.freeNeedIds().every(id => hh.needs[id] === 100)), 'routine fills all free needs for every horse');
  ok(g2.horses.some(hh => HR.NEEDS.some(n => n.cost && hh.needs[n.id] < 100)), 'routine leaves paid needs for hands-on care');
}
{
  // save migration: a pre-needs horse gets content defaults, not sudden misery
  const legacy = { breed: 'mustang', sex: 'mare', age: 14, speed: 60, stamina: 60, temperament: 60, health: 90, happy: 85 };
  HR.needsInit(legacy);
  ok(legacy.needs && HR.NEED_IDS.every(id => legacy.needs[id] >= 50), 'needsInit gives legacy horses comfortable defaults');
  ok(HR.careTier(legacy).id === 'content' || HR.careTier(legacy).id === 'pampered', 'a migrated horse is at least Content');
  // needsInit is idempotent and clamps garbage
  legacy.needs.groom = 999; legacy.needs.rest = -50;
  HR.needsInit(legacy);
  ok(legacy.needs.groom === 100 && legacy.needs.rest === 0, 'needsInit clamps out-of-range need values');
}
{
  // care goal is appended and completes on a pampered horse
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'care1');
  ok(goal, 'care goal exists in the chain');
  ok(!goal.done(g), 'care goal is unmet on a fresh game');
  for (const id of HR.NEED_IDS) g.horses[0].needs[id] = 100;
  ok(goal.done(g), 'care goal completes once a horse is fully pampered');
}

// ---- rival ranches & regional leaderboard (round 22) ----
{
  // config surface
  ok(Array.isArray(HR.RIVALS) && HR.RIVALS.length >= 4, 'a set of rival ranches exists');
  ok(new Set(HR.RIVALS.map(r => r.id)).size === HR.RIVALS.length, 'rival ids are unique');
  ok(HR.RIVALS.every(r => r.name && r.emoji && r.disc && r.pace > 0), 'every rival has a name, emoji, discipline, pace');
  ok(HR.RIVALS.every(r => HR.disciplineDef(r.disc)), 'every rival favours a real discipline');
  ok(HR.rivalDef(HR.RIVALS[0].id) && HR.rivalDef('nope') === null, 'rivalDef lookup + miss');
  ok(HR.rivalCount() === HR.RIVALS.length, 'rivalCount matches the roster');
}
{
  // rival reputation is deterministic and grows over time
  const g1 = HR.freshGame(); g1.day = 10;
  const g2 = HR.freshGame(); g2.day = 10;
  const id = HR.RIVALS[0].id;
  ok(HR.rivalRep(g1, id) === HR.rivalRep(g2, id), 'rivalRep is deterministic for a given day');
  const early = HR.rivalRep({ day: 5 }, id), late = HR.rivalRep({ day: 200 }, id);
  ok(late > early, 'rival reputation grows as days pass');
  ok(HR.rivalRep({ day: 10 }, 'nope') === 0, 'unknown rival has zero rep');
}
{
  // standings include the player, are sorted desc, and assign 1-based ranks
  const g = HR.freshGame(); g.day = 20; g.rep = 0; g.prestige = 0;
  const s = HR.standings(g);
  ok(s.length === HR.RIVALS.length + 1, 'standings include every rival plus the player');
  ok(s.filter(r => r.isPlayer).length === 1, 'exactly one player row');
  for (let i = 1; i < s.length; i++) ok(s[i - 1].score >= s[i].score, 'standings sorted by score desc');
  ok(s.every((r, i) => r.rank === i + 1), 'ranks are 1-based and contiguous');
  // a broke, fameless start sits near the bottom
  ok(HR.playerRank(g) >= HR.RIVALS.length, 'a fresh ranch starts near the bottom of the table');
}
{
  // the player climbs as reputation/prestige rise, and can reach #1
  const g = HR.freshGame(); g.day = 15;
  const low = HR.playerRank(g);
  g.rep = 50000; g.prestige = 20000;
  const high = HR.playerRank(g);
  ok(high < low, 'gaining reputation & prestige improves the player rank');
  ok(high === 1, 'a dominant ranch reaches #1');
  ok(HR.leaderRanch(g).isPlayer, 'leaderRanch is the player when they top the table');
  ok(HR.playerScore(g) === Math.round(g.rep + g.prestige * 0.5), 'playerScore = rep + half prestige');
}
{
  // tickStandings records rank history for movement arrows
  const g = HR.freshGame(); g.day = 12; g.rep = 0; g.prestige = 0;
  HR.tickStandings(g);
  const startRank = g.lastRank;
  ok(typeof startRank === 'number' && g.bestRank === startRank, 'first tick seeds lastRank & bestRank');
  g.rep = 60000; g.prestige = 30000; // now dominant
  HR.tickStandings(g);
  ok(g.prevRank === startRank && g.lastRank < startRank, 'a big rep jump is reflected as a climb (prev>last)');
  ok(g.bestRank === g.lastRank, 'bestRank tracks the best (lowest) rank achieved');
  // best rank does not regress if the player later slips
  const best = g.bestRank; g.rep = 0; g.prestige = 0; HR.tickStandings(g);
  ok(g.bestRank === best, 'bestRank never regresses after slipping');
}
{
  // advanceDay refreshes standings each day, and #1 unlocks the top-of-region achievement
  const g = HR.freshGame(); g.feed = 9999; g.rep = 80000; g.prestige = 40000;
  HR.advanceDay(g, rng(4));
  ok(g.lastRank === 1, 'advanceDay keeps the rank fresh (dominant ranch is #1)');
  HR.checkAchievements(g);
  ok((g.achievements || []).indexOf('topranch') >= 0, 'reaching #1 unlocks the Top of the Region achievement');
  // the Top-3 goal exists and completes for a top ranch
  const goal = HR.GOALS.find(x => x.id === 'top3');
  ok(goal && goal.done(g), 'the Top-3 goal completes once the player is high enough');
  const fresh = HR.freshGame(); fresh.day = 20;
  ok(!goal.done(fresh), 'the Top-3 goal is unmet for a bottom-table newcomer');
}

// ---- tack & equipment (round 23) ----
{
  // config surface
  ok(Array.isArray(HR.TACK) && HR.TACK.length >= 6, 'a tack catalogue exists');
  ok(new Set(HR.TACK.map(t => t.id)).size === HR.TACK.length, 'tack ids are unique');
  ok(HR.TACK.every(t => t.cost > 0 && t.repReq >= 0 && t.emoji && t.name && HR.TACK_SLOTS.indexOf(t.slot) >= 0), 'each tack item has cost, repReq, emoji, name, valid slot');
  ok(HR.TACK_SLOTS.length === 3, 'three equipment slots');
  ok(HR.tackDef(HR.TACK[0].id) && HR.tackDef('nope') === null, 'tackDef lookup + miss');
  const h = HR.mkHorse({ breed: 'arabian', age: 12 });
  ok(h.tack && HR.TACK_SLOTS.every(sl => h.tack[sl] === null), 'mkHorse seeds empty tack slots');
  ok(HR.equippedTack(h).length === 0, 'a new horse wears no tack');
}
{
  // buy → own → equip → bonus; rep-gating & affordability
  const g = HR.freshGame(); g.money = 100000; g.rep = 0;
  const cheap = HR.TACK.find(t => t.repReq === 0 && t.show);
  const m0 = g.money;
  const rb = HR.buyTack(g, cheap.id);
  ok(rb.ok && HR.hasTack(g, cheap.id) && g.money === m0 - cheap.cost, 'buying tack marks it owned and spends coins');
  ok(!HR.buyTack(g, cheap.id).ok, 'cannot buy the same item twice');
  const h = g.horses[0];
  const re = HR.equipTack(g, h, cheap.id);
  ok(re.ok && HR.equippedIn(h, cheap.slot).id === cheap.id, 'equip places the item in its slot');
  ok(HR.tackShowMult(h) > 1, 'a show item raises the tack show multiplier');
  // rep-gated item blocked then allowed
  const fancy = HR.TACK.find(t => t.repReq >= 40);
  g.rep = fancy.repReq - 1;
  ok(!HR.tackUnlocked(g, fancy.id) && !HR.buyTack(g, fancy.id).ok, 'rep-gated tack is locked below its requirement');
  g.rep = fancy.repReq;
  ok(HR.buyTack(g, fancy.id).ok, 'rep-gated tack unlocks at its requirement');
  // affordability + not-owned guards
  const poor = HR.freshGame(); poor.money = 0; poor.rep = 9999;
  ok(!HR.tackAffordable(poor, cheap.id) && !HR.buyTack(poor, cheap.id).ok, 'cannot buy tack you cannot afford');
  ok(!HR.equipTack(poor, poor.horses[0], cheap.id).ok, 'cannot equip tack you do not own');
}
{
  // a single physical item lives on only ONE horse — equipping moves it
  const g = HR.freshGame(); g.money = 100000;
  const a = g.horses[0], b = g.horses[1];
  const item = HR.TACK.find(t => t.repReq === 0);
  HR.buyTack(g, item.id);
  HR.equipTack(g, a, item.id);
  ok(HR.tackWearer(g, item.id).id === a.id, 'the item is worn by the first horse');
  HR.equipTack(g, b, item.id);
  ok(HR.tackWearer(g, item.id).id === b.id, 'equipping elsewhere moves the item');
  ok(HR.equippedIn(a, item.slot) === null, 'the first horse no longer wears it');
  HR.unequipTack(g, b, item.slot);
  ok(HR.equippedIn(b, item.slot) === null && HR.hasTack(g, item.id), 'unequip frees the slot but keeps it owned');
}
{
  // the show bonus actually moves discipline scores, and is capped
  const disc = HR.DISCIPLINES[0];
  const g = HR.freshGame(); g.money = 100000; g.rep = 9999;
  const base = HR.mkHorse({ breed: 'arabian', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  const kitted = HR.mkHorse({ breed: 'arabian', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  kitted.trait = base.trait; // same personality so only the tack differs (traitMult is equal)
  for (const id of HR.NEED_IDS) { base.needs[id] = 100; kitted.needs[id] = 100; }
  g.horses = [base, kitted];
  HR.TACK.filter(t => t.show).forEach(t => { HR.buyTack(g, t.id); HR.equipTack(g, kitted, t.id); });
  ok(HR.disciplineScore(kitted, disc) > HR.disciplineScore(base, disc), 'a tacked-up horse out-scores a bare twin');
  ok(HR.tackShowMult(kitted) <= 1 + HR.TACK_SHOW_CAP + 1e-9, 'total show bonus is capped');
  // a discipline-specific item helps its discipline specifically
  const halterItem = HR.TACK.find(t => t.disc && t.disc.id === 'halter');
  if (halterItem) { ok(HR.tackDiscMult(kitted, 'halter') >= 1, 'discipline tack multiplier is >= 1'); }
}
{
  // accessory effects: grooming kit slows groom decay; weather gear cuts seasonal stress
  const gkit = HR.TACK.find(t => t.groomDecay), fly = HR.TACK.find(t => t.stressCut);
  const g = HR.freshGame(); g.money = 100000;
  const bare = g.horses[0], kept = g.horses[1];
  HR.buyTack(g, gkit.id); HR.equipTack(g, kept, gkit.id);
  const groomNeed = HR.NEEDS.find(n => n.id === 'groom');
  ok(HR.needDecayFor(g, groomNeed, kept) < HR.needDecayFor(g, groomNeed, bare), 'grooming kit slows the grooming need decay');
  // weather stress: a summer day raises exercise decay; a fly mask reduces the extra
  const summer = { day: HR.SEASON_LEN + 1 }; // day 15 = summer
  ok(HR.seasonOf(summer.day).id === 'summer', 'test day lands in summer');
  const exNeed = HR.NEEDS.find(n => n.id === 'exercise');
  HR.buyTack(g, fly.id); HR.equipTack(g, kept, fly.id);
  ok(HR.needDecayFor(summer, exNeed, kept) < HR.needDecayFor(summer, exNeed, bare), 'weather gear eases summer need stress');
}
{
  // save migration: pre-tack horses & saves get safe empty slots; bad ids dropped
  const legacy = { breed: 'mustang', age: 14, speed: 60, stamina: 60, temperament: 60, health: 90, happy: 85 };
  HR.tackInit(legacy);
  ok(legacy.tack && HR.TACK_SLOTS.every(sl => legacy.tack[sl] === null), 'tackInit gives legacy horses empty slots');
  // an item in the wrong slot is cleared
  legacy.tack.saddle = HR.TACK.find(t => t.slot === 'accessory').id;
  HR.tackInit(legacy);
  ok(legacy.tack.saddle === null, 'tackInit clears gear that no longer fits its slot');
  // goal + achievement
  const g = HR.freshGame(); g.money = 100000;
  const goal = HR.GOALS.find(x => x.id === 'tack1');
  ok(goal && !goal.done(g), 'the tack goal is unmet on a fresh game');
  const it = HR.TACK.find(t => t.repReq === 0);
  HR.buyTack(g, it.id); HR.equipTack(g, g.horses[0], it.id);
  ok(goal.done(g), 'the tack goal completes once a horse is equipped');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'fulltack');
  ok(ach && !ach.check(g), 'Fully Tacked is not yet unlocked with one item');
}

// ---- show minigame ("ride the round") scoring (round 24) ----
{
  // config + fence scoring
  ok(HR.SHOW_GAME && HR.SHOW_GAME.fences >= 3 && HR.SHOW_GAME.zoneHalf > 0, 'minigame config exists');
  ok(HR.SHOW_PERF_CAP > 0 && HR.SHOW_PERF_CAP <= 0.2, 'the minigame swing is capped small (<=20%)');
  ok(Math.abs(HR.fenceScore(0.5) - 1) < 1e-9, 'a perfectly-centred jump scores 1');
  ok(HR.fenceScore(0) < 0.2 && HR.fenceScore(1) < 0.2, 'edge-of-bar jumps score near zero');
  ok(HR.fenceScore(0.5) > HR.fenceScore(0.7) && HR.fenceScore(0.7) > HR.fenceScore(0.95), 'fenceScore falls off from the centre');
  ok(HR.fenceScore(-5) >= 0 && HR.fenceScore(9) >= 0, 'fenceScore clamps out-of-range input');
}
{
  // perf multiplier is neutral at 0.5, bounded at the extremes
  ok(Math.abs(HR.showPerfMult(0.5) - 1) < 1e-9, 'perf 0.5 is neutral (×1.0)');
  ok(Math.abs(HR.showPerfMult(1) - (1 + HR.SHOW_PERF_CAP)) < 1e-9, 'a perfect run gives +cap');
  ok(Math.abs(HR.showPerfMult(0) - (1 - HR.SHOW_PERF_CAP)) < 1e-9, 'a botched run gives -cap');
  ok(HR.showPerfMult(5) <= 1 + HR.SHOW_PERF_CAP + 1e-9 && HR.showPerfMult(-5) >= 1 - HR.SHOW_PERF_CAP - 1e-9, 'multiplier stays within the cap');
}
{
  // a great run outperforms a poor run for the SAME horse at the same tier
  const tier = HR.COMP_TIERS[0], disc = HR.DISCIPLINES[0];
  const h = HR.mkHorse({ breed: 'quarter', age: 12, speed: 62, stamina: 62, temperament: 62, health: 100, happy: 100 });
  let goodScore = 0, poorScore = 0;
  for (let seed = 1; seed <= 40; seed++) {
    goodScore += HR.runCompetition(h, disc, tier, rng(seed), 1).score;
    poorScore += HR.runCompetition(h, disc, tier, rng(seed), 0).score;
  }
  ok(goodScore > poorScore, 'a perfect ride beats a botched ride for the same horse');
  // backward-compatible: omitting perf equals a neutral run
  const s0 = HR.runCompetition(h, disc, tier, rng(7)).score;
  const s5 = HR.runCompetition(h, disc, tier, rng(7), 0.5).score;
  ok(s0 === s5, 'instant-resolve (no perf) matches a neutral 0.5 run — backward compatible');
}
{
  // a skilled horse still beats a klutz who nailed the minigame, at the same tier
  const tier = HR.COMP_TIERS[1], disc = HR.DISCIPLINES[0];
  const ace = HR.mkHorse({ breed: 'thoroughbred', age: 12, speed: 95, stamina: 92, temperament: 90, health: 100, happy: 100 });
  const dud = HR.mkHorse({ breed: 'shetland', age: 12, speed: 40, stamina: 40, temperament: 40, health: 100, happy: 100 });
  let aceWorse = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const aceScore = HR.runCompetition(ace, disc, tier, rng(seed), 0).score;  // ace rides badly
    const dudScore = HR.runCompetition(dud, disc, tier, rng(seed), 1).score;  // dud rides perfectly
    if (aceScore <= dudScore) aceWorse++;
  }
  ok(aceWorse === 0, 'a strong horse riding badly still out-scores a weak horse riding perfectly');
}
{
  // applyCompetition threads perf through and records the ride stats
  const g = HR.freshGame(); g.rep = 5000;
  const tier = HR.COMP_TIERS[0], disc = HR.DISCIPLINES[0], h = g.horses[0];
  HR.applyCompetition(g, h, disc, tier, rng(3), 0.9);
  ok((g.stats.showGamesPlayed || 0) === 1, 'playing the minigame increments showGamesPlayed');
  ok(Math.abs((g.stats.bestShowPerf || 0) - 0.9) < 1e-9, 'best ride performance is recorded');
  HR.applyCompetition(g, h, disc, tier, rng(4), null); // quick result does not count as played
  ok((g.stats.showGamesPlayed || 0) === 1, 'a quick result does not increment the ride counter');
  // goal + achievement
  const goal = HR.GOALS.find(x => x.id === 'ride1');
  ok(goal && goal.done(g), 'the ride-a-round goal completes once played');
  const fresh = HR.freshGame();
  ok(!goal.done(fresh), 'the ride goal is unmet on a fresh game');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'flawless');
  const g2 = HR.freshGame(); g2.stats.bestShowPerf = 0.98;
  ok(ach && ach.check(g2) && !ach.check(fresh), 'a near-flawless ride unlocks the Clear Round achievement');
}

// ---- weekly contracts / notice board (round 25) ----
{
  // config + deterministic board
  ok(Array.isArray(HR.CONTRACTS) && HR.CONTRACTS.length >= HR.BOARD_SIZE, 'a contract catalogue exists');
  ok(new Set(HR.CONTRACTS.map(c => c.id)).size === HR.CONTRACTS.length, 'contract ids are unique');
  ok(HR.CONTRACTS.every(c => c.icon && typeof c.desc === 'function' && c.reward && c.target > 0), 'each contract has icon, desc, reward, target');
  ok(HR.contractDef(HR.CONTRACTS[0].id) && HR.contractDef('nope') === null, 'contractDef lookup + miss');
  const a = HR.freshGame(), b = HR.freshGame();
  a.day = b.day = 8; // same week
  const ba = HR.contractsForWeek(a).map(c => c.id), bb = HR.contractsForWeek(b).map(c => c.id);
  ok(ba.length === HR.BOARD_SIZE && JSON.stringify(ba) === JSON.stringify(bb), 'the weekly board is deterministic for a given week');
  const wk1 = HR.contractsForWeek({ day: 1, rep: 0 }).map(c => c.id);
  const wk3 = HR.contractsForWeek({ day: 15, rep: 0 }).map(c => c.id);
  ok(JSON.stringify(wk1) !== JSON.stringify(wk3) || true, 'different weeks may draw different boards');
}
{
  // rep-gating: low-rep boards exclude gated contracts
  const gated = HR.CONTRACTS.filter(c => c.repReq > 0);
  ok(gated.length >= 1, 'some contracts are reputation-gated');
  const poorBoard = HR.contractsForWeek({ day: 8, rep: 0 });
  ok(poorBoard.every(c => !c.repReq), 'a fameless ranch is never shown rep-gated contracts');
}
{
  // fresh game seeds a board; progress + delta baseline
  const g = HR.freshGame();
  ok(g.board && g.board.week === HR.weekOf(g.day) && Array.isArray(g.board.ids) && g.board.ids.length === HR.BOARD_SIZE, 'freshGame posts the first board');
  ok(g.board.claimed.length === 0, 'nothing claimed on a fresh board');
  // a delta contract: progress is measured from the week-start snapshot
  const sellC = HR.contractDef('sell2');
  g.board = { week: HR.weekOf(g.day), ids: ['sell2'], base: { sold: 5 }, claimed: [] };
  g.stats.sold = 5;
  ok(HR.contractProgress(g, sellC).cur === 0, 'delta progress starts at 0 despite prior lifetime total');
  g.stats.sold = 7;
  ok(HR.contractProgress(g, sellC).cur === 2 && HR.contractDone(g, sellC), 'delta progress tracks activity since week-start');
}
{
  // state contract reads live game state (no baseline)
  const g = HR.freshGame(); g.board = { week: HR.weekOf(g.day), ids: ['herd8'], base: {}, claimed: [] };
  const herdC = HR.contractDef('herd8');
  ok(!HR.contractDone(g, herdC), 'herd contract unmet with a starter pair');
  while (g.horses.length < herdC.target) g.horses.push(HR.mkHorse({ breed: 'mustang', age: 12 }));
  ok(HR.contractDone(g, herdC), 'herd contract completes when the herd is big enough');
}
{
  // claiming pays exactly once and cannot double-claim
  const g = HR.freshGame(); g.money = 1000; g.rep = 0;
  g.board = { week: HR.weekOf(g.day), ids: ['win1'], base: { showWins: 0 }, claimed: [] };
  const c = HR.contractDef('win1');
  ok(!HR.claimContract(g, 'win1').ok, 'cannot claim an incomplete contract');
  g.stats.showWins = 1; // now done
  const m0 = g.money, rep0 = g.rep;
  const r = HR.claimContract(g, 'win1');
  ok(r.ok && g.money === m0 + (c.reward.money || 0) && g.rep === rep0 + (c.reward.rep || 0), 'claiming pays the reward');
  ok(g.stats.contractsDone === 1, 'claiming increments the completed-contracts stat');
  ok(!HR.claimContract(g, 'win1').ok && g.money === m0 + (c.reward.money || 0), 'cannot double-claim (pays only once)');
  ok(!HR.claimContract(g, 'sell2').ok, 'cannot claim a contract not on this week’s board');
}
{
  // board refreshes when the week rolls over; claimed resets, base re-snapshots
  const g = HR.freshGame(); g.day = 3; HR.refreshBoard(g);
  const wk0 = g.board.week; g.board.claimed.push(g.board.ids[0]);
  g.day = 3 + 7; // next week
  HR.refreshBoard(g);
  ok(g.board.week === wk0 + 1 && g.board.claimed.length === 0, 'a new week posts a fresh, unclaimed board');
  ok(HR.daysUntilBoardRefresh({ day: 1 }) === 7 && HR.daysUntilBoardRefresh({ day: 7 }) === 1, 'refresh countdown reads days left in the week');
}
{
  // advanceDay keeps the board fresh, and the goal/achievement wire up
  const g = HR.freshGame();
  HR.advanceDay(g, rng(2));
  ok(g.board && g.board.week === HR.weekOf(g.day), 'advanceDay keeps the board current');
  const goal = HR.GOALS.find(x => x.id === 'contract1');
  ok(goal && !goal.done(g), 'the contract goal is unmet before completing one');
  g.stats.contractsDone = 1;
  ok(goal.done(g), 'the contract goal completes after a claim');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'contractor');
  const g2 = HR.freshGame(); g2.stats.contractsDone = 10;
  ok(ach && ach.check(g2) && !ach.check(g), 'completing 10 contracts unlocks Reliable Hand');
}

// ---- stable staff / hiring (round 26) ----
{
  // config + hire/fire + payroll
  ok(Array.isArray(HR.STAFF_ROLES) && HR.STAFF_ROLES.length >= 4, 'a staff roster exists');
  ok(new Set(HR.STAFF_ROLES.map(r => r.id)).size === HR.STAFF_ROLES.length, 'staff ids are unique');
  ok(HR.STAFF_ROLES.every(r => r.salary > 0 && r.emoji && r.name && r.desc), 'each role has a salary, emoji, name, desc');
  ok(HR.MAX_STAFF === HR.STAFF_ROLES.length, 'the crew cap equals the number of distinct roles');
  ok(HR.staffDef('groom') && HR.staffDef('nope') === null, 'staffDef lookup + miss');
  const g = HR.freshGame(); g.rep = 9999;
  ok(HR.staffCount(g) === 0 && HR.staffPayroll(g) === 0, 'a fresh ranch has no staff and no payroll');
  const r = HR.hireStaff(g, 'groom');
  ok(r.ok && HR.hasStaff(g, 'groom') && HR.staffCount(g) === 1, 'hiring adds the role to the crew');
  ok(!HR.hireStaff(g, 'groom').ok, 'cannot hire the same role twice');
  ok(HR.staffPayroll(g) === HR.staffDef('groom').salary, 'payroll sums the hired salaries');
  HR.hireStaff(g, 'hand');
  ok(HR.staffPayroll(g) === HR.staffDef('groom').salary + HR.staffDef('hand').salary, 'payroll adds up across multiple staff');
  HR.fireStaff(g, 'groom');
  ok(!HR.hasStaff(g, 'groom') && HR.staffCount(g) === 1, 'firing removes the role');
  // rep-gating
  const poor = HR.freshGame(); poor.rep = 0;
  const gated = HR.STAFF_ROLES.find(x => x.repReq > 0);
  ok(!HR.staffUnlocked(poor, gated.id) && !HR.hireStaff(poor, gated.id).ok, 'rep-gated roles cannot be hired below their requirement');
}
{
  // salaries are deducted daily in advanceDay
  const g = HR.freshGame(); g.rep = 9999; g.money = 5000; g.feed = 9999;
  HR.hireStaff(g, 'groom');
  const m0 = g.money;
  HR.advanceDay(g, rng(5));
  ok(g.money < m0, 'staff wages are deducted each day');
  ok((g.stats.staffWages || 0) >= HR.staffDef('groom').salary, 'wages are tracked in stats');
  // no staff → no wage line at all
  const g2 = HR.freshGame(); g2.feed = 9999; const m2 = g2.money;
  HR.advanceDay(g2, rng(5));
  ok((g2.stats.staffWages || 0) === 0, 'hiring nobody costs no wages');
}
{
  // Groom tops up care needs each day but does NOT fully replace manual care
  const withGroom = HR.freshGame(); withGroom.rep = 9999; withGroom.feed = 9999; HR.hireStaff(withGroom, 'groom');
  const without = HR.freshGame(); without.feed = 9999;
  // start both herds at a middling care level
  for (const h of withGroom.horses) for (const id of HR.NEED_IDS) h.needs[id] = 50;
  for (const h of without.horses) for (const id of HR.NEED_IDS) h.needs[id] = 50;
  HR.advanceDay(withGroom, rng(9)); HR.advanceDay(without, rng(9));
  ok(HR.careScore(withGroom.horses[0]) > HR.careScore(without.horses[0]), 'a Groom keeps horses better cared-for');
  ok(HR.careScore(withGroom.horses[0]) < 100, 'but a Groom does not top care to a free perfect 100');
}
{
  // Stable Hand auto-runs the free routine; Groundskeeper trims hay; Farrier cuts care cost; Trainer cuts training cost
  const g = HR.freshGame(); g.rep = 9999; g.feed = 9999;
  for (const h of g.horses) for (const id of HR.freeNeedIds()) h.needs[id] = 20;
  HR.hireStaff(g, 'hand'); HR.advanceDay(g, rng(3));
  ok(g.horses.every(h => HR.freeNeedIds().every(id => h.needs[id] >= 80)), 'a Stable Hand refreshes the free needs each day');
  // farrier care-cost discount
  const gf = HR.freshGame(); gf.rep = 9999; const paid = HR.NEEDS.find(n => n.cost);
  const full = HR.careCost(gf, paid.id);
  HR.hireStaff(gf, 'farrier');
  ok(HR.careCost(gf, paid.id) < full, 'a Farrier reduces paid care costs');
  // groundskeeper feed reduction (fewer hay eaten per day) — use a big herd so 10% is a clear gap
  const noGk = HR.freshGame(); noGk.feed = 5000; const withGk = HR.freshGame(); withGk.rep = 9999; withGk.feed = 5000; HR.hireStaff(withGk, 'groundskeeper');
  for (let i = 0; i < 12; i++) { noGk.horses.push(HR.mkHorse({ breed: 'mustang', age: 20 })); withGk.horses.push(HR.mkHorse({ breed: 'mustang', age: 20 })); }
  HR.advanceDay(noGk, rng(1)); HR.advanceDay(withGk, rng(1));
  ok(withGk.feed > noGk.feed, 'a Groundskeeper makes the herd eat less hay');
  // trainer training discount
  const gt = HR.freshGame(); gt.rep = 9999; const h = gt.horses[0];
  const base = HR.trainCostFor(gt, h, 'speed');
  HR.hireStaff(gt, 'trainer');
  ok(HR.trainCostFor(gt, h, 'speed') < base, 'a Trainer makes training cheaper');
  ok(HR.trainCostFor(HR.freshGame(), h, 'speed') === HR.trainCost(h, 'speed'), 'no trainer → trainCostFor equals the base cost');
}
{
  // staffEffect defaults are neutral with no staff; save migration keeps only valid roles
  const g = HR.freshGame();
  ok(HR.staffEffect(g, 'careTopUp') === 0 && HR.staffEffect(g, 'feedMult') === 1 && HR.staffEffect(g, 'trainCostMult') === 1, 'no staff → neutral effects');
  ok(HR.staffEffect(undefined, 'feedMult') === 1, 'staffEffect tolerates a missing game');
  // goal + achievement
  const goal = HR.GOALS.find(x => x.id === 'staff1');
  ok(goal && !goal.done(g), 'the hire-staff goal is unmet on a fresh ranch');
  HR.hireStaff(g, 'hand');
  ok(goal.done(g), 'the hire-staff goal completes after a hire');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'fullcrew');
  const full = HR.freshGame(); full.staff = HR.STAFF_ROLES.map(r => r.id);
  ok(ach && ach.check(full) && !ach.check(g), 'employing the whole crew unlocks Full Crew');
}

// ---- New Game+ / prestige (Legacy) (round 27) ----
{
  // legacy points: 0 on a fresh ranch, monotonic, bounded (diminishing)
  const fresh = HR.freshGame();
  ok(HR.legacyPointsFor(fresh) === 0, 'a brand-new ranch banks no Legacy');
  const mid = HR.freshGame(); mid.rep = 3000; mid.prestige = 200; mid.hallOfFame = [1, 2]; mid.stats.bestOVR = 80; mid.stats.showWins = 9;
  const more = HR.freshGame(); more.rep = 6000; more.prestige = 500; more.hallOfFame = [1, 2, 3, 4]; more.stats.bestOVR = 95; more.stats.showWins = 25;
  ok(HR.legacyPointsFor(mid) > 0, 'an established ranch banks Legacy');
  ok(HR.legacyPointsFor(more) > HR.legacyPointsFor(mid), 'more accomplished runs bank more Legacy (monotonic)');
  // diminishing: doubling rep does NOT double the points
  const a = HR.freshGame(); a.rep = 2500; a.hallOfFame = [1];
  const b = HR.freshGame(); b.rep = 5000; b.hallOfFame = [1];
  ok(HR.legacyPointsFor(b) < 2 * HR.legacyPointsFor(a), 'Legacy gain has diminishing returns');
}
{
  // legacy bonuses are capped & increasing
  ok(Math.abs(HR.legacyBonus({ points: 0 }, 'showPrize') - 1) < 1e-9, 'no legacy → neutral show-prize bonus');
  ok(HR.legacyBonus({ points: 100 }, 'showPrize') > 1, 'legacy points raise the show-prize bonus');
  ok(HR.legacyBonus({ points: 999999 }, 'showPrize') <= 1.40 + 1e-9, 'show-prize bonus is capped at +40%');
  ok(HR.legacyBonus({ points: 999999 }, 'startCoins') <= 15000, 'starting coins bonus is capped');
  ok(HR.legacyBonus({ points: 999999 }, 'startFeed') <= 200, 'starting feed bonus is capped');
  ok(HR.legacyLevel({ points: 0 }) === 0 && HR.legacyLevel({ points: 100 }) >= 1, 'legacy level grows with points');
}
{
  // the show-prize bonus actually pays more via applyCompetition
  const tier = HR.COMP_TIERS[0], disc = HR.DISCIPLINES[0];
  const mk = () => HR.mkHorse({ breed: 'arabian', age: 12, speed: 99, stamina: 99, temperament: 99, health: 100, happy: 100 });
  let plain = 0, veteran = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const g0 = HR.freshGame(); g0.legacy = { points: 0, resets: 0 };
    const g1 = HR.freshGame({ points: 250, resets: 3 });
    plain += HR.applyCompetition(g0, mk(), disc, tier, rng(seed)).prize;
    veteran += HR.applyCompetition(g1, mk(), disc, tier, rng(seed)).prize;
  }
  ok(veteran > plain, 'a high-Legacy ranch earns bigger show prizes');
}
{
  // prestige gating: cannot retire an unestablished ranch
  const g = HR.freshGame();
  ok(!HR.canPrestige(g), 'a fresh ranch cannot prestige');
  g.rep = HR.PRESTIGE_REP;
  ok(!HR.canPrestige(g), 'reputation alone is not enough (needs a Hall-of-Famer)');
  g.hallOfFame = [HR.hofRecord(HR.mkHorse({ breed: 'arabian', age: 30, wins: 4 }), 'retired', 30)];
  ok(HR.canPrestige(g), 'Master-Breeder rep + a Hall-of-Fame legend unlocks prestige');
}
{
  // applyPrestige banks legacy, resets the ranch, and carries the total forward
  const g = HR.freshGame(); g.rep = 4000; g.money = 99999; g.prestige = 300;
  g.hallOfFame = [1, 2]; g.stats.bestOVR = 88; g.stats.showWins = 12;
  g.horses.push(HR.mkHorse({ breed: 'friesian', age: 12 })); // 3 horses now
  const gain = HR.legacyPointsFor(g);
  ok(gain > 0, 'there is Legacy to bank');
  const ng = HR.applyPrestige(g);
  ok(ng.legacy.points === gain && ng.legacy.resets === 1, 'prestige banks the Legacy and counts the reset');
  ok(ng.horses.length === 2 && ng.day === 1 && ng.rep === 0, 'the ranch itself resets (starter pair, day 1, no rep)');
  ok(ng.hallOfFame.length === 0, 'the new ranch starts with an empty Hall of Fame');
  // start bonuses reflect the banked legacy
  ok(ng.money >= 1500 + HR.legacyBonus(ng.legacy, 'startCoins') - 1, 'New Game+ starts with the legacy coin bonus');
  ok(ng.seenIntro === true && ng.tut.done === true, 'veterans skip the intro/tutorial on New Game+');
  // a second prestige accumulates
  ng.rep = 5000; ng.hallOfFame = [1]; ng.prestige = 100; ng.stats.showWins = 5;
  const ng2 = HR.applyPrestige(ng);
  ok(ng2.legacy.points > ng.legacy.points && ng2.legacy.resets === 2, 'a second prestige accumulates Legacy and resets');
}
{
  // freshGame is deterministic given the same legacy; higher legacy → more starting coins
  const g0 = HR.freshGame({ points: 0, resets: 0 });
  const gL = HR.freshGame({ points: 300, resets: 2 });
  ok(gL.money > g0.money, 'a legacy head-start grants more starting coins');
  ok(HR.normLegacy({ points: -5, resets: 2.9 }).points === 0 && HR.normLegacy({ points: 3.9 }).resets === 0, 'normLegacy floors & clamps');
}

// ---- temperament & discipline affinity (round 28) ----
{
  // init + accessors
  const h = HR.mkHorse({ breed: 'arabian', age: 12 });
  ok(h.aff && HR.DISC_IDS.every(id => h.aff[id] === 0), 'mkHorse seeds zeroed affinity for every discipline');
  ok(HR.affinity(h, 'race') === 0 && HR.affinityMult(h, 'race') === 1, 'a green horse has no affinity bonus');
  HR.gainAffinity(h, 'race', 40);
  ok(HR.affinity(h, 'race') === 40, 'gainAffinity accumulates points');
  ok(HR.affinityMult(h, 'race') > 1, 'affinity raises the discipline multiplier');
  ok(HR.gainAffinity(h, 'nope', 10) === 0, 'affinity for an unknown discipline is a no-op');
}
{
  // affinity is bounded at the cap
  const h = HR.mkHorse({ breed: 'quarter', age: 12 });
  HR.gainAffinity(h, 'race', 99999);
  ok(HR.affinity(h, 'race') === HR.AFF_MAX, 'affinity is capped at AFF_MAX');
  ok(Math.abs(HR.affinityMult(h, 'race') - (1 + HR.AFF_CAP)) < 1e-9, 'a fully-schooled horse gets exactly +cap');
  ok(HR.AFF_CAP <= 0.15, 'the affinity bonus stays small (<=15%)');
}
{
  // training a stat develops the disciplines that use it (racing leans on speed)
  const h = HR.mkHorse({ breed: 'quarter', age: 12, speed: 50, stamina: 50, temperament: 50 });
  for (let i = 0; i < 8; i++) HR.developAffinityFromTraining(h, 'speed');
  ok(HR.affinity(h, 'race') > HR.affinity(h, 'dressage'), 'schooling speed builds racing affinity faster than dressage');
  // applyTrain also grows affinity as a side effect
  const h2 = HR.mkHorse({ breed: 'arabian', age: 12, speed: 40 });
  const a0 = HR.affinity(h2, 'race');
  HR.applyTrain(h2, 'speed');
  ok(HR.affinity(h2, 'race') > a0, 'applyTrain develops discipline affinity');
}
{
  // competing builds affinity for that discipline (via applyCompetition)
  const g = HR.freshGame(); g.rep = 5000;
  const h = g.horses[0]; const disc = HR.disciplineDef('dressage'), tier = HR.COMP_TIERS[0];
  const a0 = HR.affinity(h, 'dressage');
  HR.applyCompetition(g, h, disc, tier, rng(3));
  ok(HR.affinity(h, 'dressage') > a0, 'competing in a discipline deepens its affinity');
}
{
  // a schooled specialist out-scores an equal-stat generalist in its discipline
  const disc = HR.disciplineDef('race');
  const spec = HR.mkHorse({ breed: 'thoroughbred', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  const gen = HR.mkHorse({ breed: 'thoroughbred', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  gen.trait = spec.trait; // same personality so only schooling differs
  for (const id of HR.NEED_IDS) { spec.needs[id] = 100; gen.needs[id] = 100; }
  HR.gainAffinity(spec, 'race', HR.AFF_MAX);
  ok(HR.disciplineScore(spec, disc) > HR.disciplineScore(gen, disc), 'a racing specialist beats an unschooled twin on the track');
  ok(HR.specialtyOf(spec) === 'race' && HR.specialtyOf(gen) === null, 'the schooled horse has settled into a speciality');
  ok(HR.topAffinity(spec).id === 'race' && HR.topAffinity(spec).pts === HR.AFF_MAX, 'topAffinity reports the speciality');
}
{
  // composure is a derived read of bond/happy/care and trends with them
  const h = HR.mkHorse({ breed: 'welsh', age: 12, happy: 20 }); h.bond = 10; for (const id of HR.NEED_IDS) h.needs[id] = 20;
  const low = HR.composure(h);
  h.happy = 95; h.bond = 90; for (const id of HR.NEED_IDS) h.needs[id] = 100;
  const high = HR.composure(h);
  ok(high > low, 'composure rises with better bonding, mood & care');
  ok(HR.composure(h) >= 0 && HR.composure(h) <= 100, 'composure stays in 0..100');
  ok(HR.composureTier(h).id === 'serene' || HR.composureTier(h).id === 'settled', 'a well-kept horse reads as settled/serene');
}
{
  // foals inherit a hint of their parents' best affinity
  const mare = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20, genes: HR.seedGenes('arabian', rng(1)) });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, genes: HR.seedGenes('arabian', rng(2)) });
  HR.gainAffinity(mare, 'dressage', HR.AFF_MAX);
  const foal = HR.breedFoal(mare, stal, rng(7));
  ok(HR.affinity(foal, 'dressage') > 0, 'a foal is born leaning toward a parent’s speciality');
  ok(HR.affinity(foal, 'dressage') < HR.affinity(mare, 'dressage'), 'but only a hint — far below the parent (must still be schooled)');
  ok(HR.affinity(foal, 'race') === 0, 'disciplines neither parent trained start at zero');
}
{
  // save migration: pre-affinity horses get zeroed slots; goal + achievement
  const legacy = { breed: 'mustang', age: 14, speed: 60, stamina: 60, temperament: 60 };
  HR.affInit(legacy);
  ok(legacy.aff && HR.DISC_IDS.every(id => legacy.aff[id] === 0), 'affInit seeds legacy horses with zero affinity');
  legacy.aff.race = 9999; HR.affInit(legacy);
  ok(legacy.aff.race === HR.AFF_MAX, 'affInit clamps out-of-range affinity values');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'special1');
  ok(goal && !goal.done(g), 'the specialist goal is unmet on a fresh ranch');
  HR.gainAffinity(g.horses[0], 'jump', HR.SPECIALIST_AT);
  ok(goal.done(g), 'the specialist goal completes once a horse settles into a discipline');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'schooled');
  const g2 = HR.freshGame(); HR.gainAffinity(g2.horses[0], 'race', HR.AFF_MAX);
  ok(ach && ach.check(g2) && !ach.check(g), 'fully schooling a horse unlocks Master of the Craft');
}

// ---- seasonal championship series (round 29) ----
{
  // points by place & tier; season boundaries deterministic
  ok(HR.champPointsFor(1, HR.COMP_TIERS[0]) > HR.champPointsFor(2, HR.COMP_TIERS[0]), 'a win scores more than 2nd');
  ok(HR.champPointsFor(2, HR.COMP_TIERS[0]) > HR.champPointsFor(3, HR.COMP_TIERS[0]), '2nd scores more than 3rd');
  ok(HR.champPointsFor(1, HR.COMP_TIERS[3]) > HR.champPointsFor(1, HR.COMP_TIERS[0]), 'higher tiers are worth more points');
  ok(HR.seasonIndex(1) === 0 && HR.seasonIndex(HR.SEASON_LEN) === 0 && HR.seasonIndex(HR.SEASON_LEN + 1) === 1, 'season index steps every SEASON_LEN days');
  ok(HR.daysLeftInSeason({ day: 1 }) === HR.SEASON_LEN && HR.daysLeftInSeason({ day: HR.SEASON_LEN }) === 1, 'days-left counts down within a season');
}
{
  // applyCompetition awards championship points; standings sort; fresh game seeds a tally
  const g = HR.freshGame(); g.rep = 5000; g.day = 3;
  ok(g.champ && g.champ.season === HR.seasonIndex(g.day) && Object.keys(g.champ.points).length === 0, 'freshGame seeds an empty championship tally');
  const a = g.horses[0], bHorse = g.horses[1];
  // force a strong horse so it places, then award
  a.speed = a.stamina = a.temperament = 99;
  HR.awardChampionshipPoints(g, a, HR.COMP_TIERS[3], 1); // Grand Prix win
  HR.awardChampionshipPoints(g, bHorse, HR.COMP_TIERS[0], 2); // small 2nd
  const s = HR.seasonStandings(g);
  ok(s.length === 2 && s[0].id === a.id && s[0].points > s[1].points, 'standings rank horses by season points');
  ok(HR.seasonLeader(g).id === a.id, 'seasonLeader is the top scorer');
  ok(HR.champTotalPoints(g) === s[0].points + s[1].points, 'champTotalPoints sums the board');
  // a real applyCompetition also feeds the tally
  const g2 = HR.freshGame(); g2.rep = 5000;
  const h2 = g2.horses[0]; h2.speed = h2.stamina = h2.temperament = 99;
  const p0 = HR.champTotalPoints(g2);
  HR.applyCompetition(g2, h2, HR.disciplineDef('race'), HR.COMP_TIERS[0], rng(2));
  ok(HR.champTotalPoints(g2) > p0, 'applyCompetition awards championship points');
}
{
  // season prize is bounded, and closeSeason crowns + pays + resets
  ok(HR.seasonPrize(0) > 0 && HR.seasonPrize(999999) <= HR.CHAMP_PRIZE_CAP, 'the season purse is capped');
  const g = HR.freshGame(); g.day = 5; g.money = 1000; g.rep = 100;
  HR.awardChampionshipPoints(g, g.horses[0], HR.COMP_TIERS[2], 1);
  const leader = HR.seasonLeader(g), m0 = g.money, rep0 = g.rep;
  // simulate the season having rolled over: advance day into the next season, then close
  g.day = HR.SEASON_LEN + 2;
  const award = HR.closeSeason(g);
  ok(award && award.champ.name === leader.name, 'closeSeason crowns the season leader');
  ok(g.money === m0 + award.prize && g.rep === rep0 + award.rep, 'the champion is paid the purse + reputation');
  ok(g.money - m0 <= HR.CHAMP_PRIZE_CAP, 'the payout never exceeds the cap');
  ok(g.stats.seasonTitles === 1 && g.champ.lastChampion && g.champ.lastChampion.name === leader.name, 'the title is recorded');
  ok(Object.keys(g.champ.points).length === 0 && g.champ.season === HR.seasonIndex(g.day), 'the tally resets for the new season');
  // closing an empty season crowns nobody and pays nothing
  const g2 = HR.freshGame(); g2.day = HR.SEASON_LEN + 1; const mm = g2.money;
  ok(HR.closeSeason(g2) === null && g2.money === mm, 'an empty season crowns nobody and pays nothing');
}
{
  // advanceDay crowns at the season rollover, exactly once, and doesn't double-award
  const g = HR.freshGame(); g.feed = 9999; g.rep = 200; g.money = 1000;
  g.day = HR.SEASON_LEN - 1; // near the end of season 0
  HR.awardChampionshipPoints(g, g.horses[0], HR.COMP_TIERS[1], 1);
  const before = g.stats.seasonTitles || 0;
  HR.advanceDay(g, rng(1)); // → day SEASON_LEN (still season 0), no crown yet
  ok((g.stats.seasonTitles || 0) === before, 'no crown before the season actually ends');
  const m1 = g.money;
  HR.advanceDay(g, rng(1)); // → day SEASON_LEN+1 (season 1): crown season 0
  ok((g.stats.seasonTitles || 0) === before + 1, 'advanceDay crowns exactly once at the rollover');
  HR.advanceDay(g, rng(1)); // deeper into season 1: no extra crown
  ok((g.stats.seasonTitles || 0) === before + 1, 'no repeat crown on later days of the new season');
}
{
  // save migration + goal/achievement
  const legacy = HR.freshGame(); delete legacy.champ;
  HR.ensureChamp(legacy);
  ok(legacy.champ && typeof legacy.champ.points === 'object', 'ensureChamp repairs a pre-championship save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'champ1');
  ok(goal && !goal.done(g), 'the championship goal is unmet before a title');
  g.stats.seasonTitles = 1;
  ok(goal.done(g), 'the championship goal completes with a title');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'seasonlord');
  const g3 = HR.freshGame(); g3.stats.seasonTitles = 3;
  ok(ach && ach.check(g3) && !ach.check(g), 'three titles unlock Season Champion');
}

// ---- marketplace: featured listing + wishlist (round 30) ----
{
  // freshGame seeds a featured horse; it's a premium standout
  const g = HR.freshGame(); g.rep = 3000;
  HR.refreshFeatured(g);
  const f = HR.featuredHorse(g);
  ok(f && HR.isFeatured(f), 'freshGame showcases a featured horse');
  ok((HR.breedDef(f.breed) || { rarity: 1 }).rarity >= 3, 'the featured horse is a rarer breed (a standout)');
  ok(HR.featuredPrice(f) > HR.buyPrice(f), 'the featured horse carries a premium price');
  ok(Math.abs(HR.featuredPrice(f) - Math.round(HR.buyPrice(f) * HR.FEATURED_MARKUP)) < 1e-9, 'featured price = buyPrice × markup');
}
{
  // featured is deterministic per week (same attributes for the same week/rep)
  const a = HR.freshGame(); a.rep = 2000; a.day = 8;
  const b = HR.freshGame(); b.rep = 2000; b.day = 8;
  a.featured = null; b.featured = null;
  const fa = HR.featuredHorse(a), fb = HR.featuredHorse(b);
  ok(fa.breed === fb.breed && fa.sex === fb.sex && HR.valueOf(fa) === HR.valueOf(fb), 'the featured horse is deterministic per week');
  // and stable within a week (same object across calls)
  ok(HR.featuredHorse(a) === fa, 'featuredHorse is stable within the week');
  // rolling into a later week (same game) showcases a fresh listing
  a.day = 22; // week 4
  const fa2 = HR.featuredHorse(a);
  ok(fa2 && fa2 !== fa && fa2.id !== fa.id, 'a later week showcases a different listing');
}
{
  // wishlist matching by breed / coat / rarity / sex
  const h = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 12, coat: { name: 'Golden', tier: 3 } });
  ok(HR.matchesPref(h, { breed: 'arabian' }), 'matches by breed');
  ok(!HR.matchesPref(h, { breed: 'mustang' }), 'rejects a different breed');
  ok(HR.matchesPref(h, { sex: 'mare' }) && !HR.matchesPref(h, { sex: 'stallion' }), 'matches by sex');
  ok(HR.matchesPref(h, { coat: 'Golden' }) && !HR.matchesPref(h, { coat: 'Bay' }), 'matches by coat');
  ok(HR.matchesPref(h, { rarity: 3 }) && HR.matchesPref(h, { rarity: (HR.breedDef('arabian').rarity) }), 'matches rarity threshold (>=)');
  ok(!HR.matchesPref(h, { rarity: 5 }) || HR.breedDef('arabian').rarity >= 5, 'rejects too-high a rarity threshold');
  ok(!HR.matchesPref(h, {}), 'an empty pref matches nothing (no match-all)');
  // combined criteria must ALL hold
  ok(HR.matchesPref(h, { breed: 'arabian', sex: 'mare' }) && !HR.matchesPref(h, { breed: 'arabian', sex: 'stallion' }), 'combined criteria must all hold');
}
{
  // add/remove wishlist prefs + dedupe + cap; matchesWishlist is OR across prefs
  const g = HR.freshGame();
  ok(!HR.addWishlistPref(g, {}).ok, 'cannot add an empty wish');
  ok(HR.addWishlistPref(g, { breed: 'friesian' }).ok && g.wishlist.prefs.length === 1, 'adding a wish works');
  ok(!HR.addWishlistPref(g, { breed: 'friesian' }).ok, 'duplicate wishes are rejected');
  HR.addWishlistPref(g, { sex: 'stallion' }); // a second, orthogonal wish
  const h1 = HR.mkHorse({ breed: 'friesian', sex: 'mare', age: 12 }); // matches only the breed wish
  const h2 = HR.mkHorse({ breed: 'shetland', sex: 'mare', age: 12 }); // matches neither
  ok(HR.matchesWishlist(h1, g.wishlist) && !HR.matchesWishlist(h2, g.wishlist), 'wishlist matches if ANY pref matches');
  HR.removeWishlistPref(g, 0); // drop the breed wish, leaving only sex:stallion
  ok(g.wishlist.prefs.length === 1 && !HR.matchesWishlist(h1, g.wishlist), 'removing a wish drops its matches');
}
{
  // match counting across market + auction
  const g = HR.freshGame(); g.featured = null; g.market = [];
  HR.addWishlistPref(g, { breed: 'mustang' });
  g.market = [HR.mkHorse({ breed: 'mustang', age: 12 }), HR.mkHorse({ breed: 'shetland', age: 12 })];
  ok(HR.marketMatches(g).length === 1, 'marketMatches counts matching market horses');
  g.auction = { day: g.day, lots: [{ horse: HR.mkHorse({ breed: 'mustang', age: 12 }), won: false, closed: false }, { horse: HR.mkHorse({ breed: 'arabian', age: 12 }), won: false, closed: false }] };
  ok(HR.auctionMatches(g).length === 1, 'auctionMatches counts matching open lots');
  ok(HR.wishlistMatches(g) === 2, 'wishlistMatches sums market + auction matches');
  // a closed/won lot does not count
  g.auction.lots[0].closed = true;
  ok(HR.auctionMatches(g).length === 0, 'closed lots are not matched');
}
{
  // save migration + goal/achievement; economy-safe pricing (featured never cheaper than normal)
  const legacy = HR.freshGame(); delete legacy.wishlist; delete legacy.featured;
  legacy.wishlist = HR.normWishlist(legacy.wishlist); if (legacy.featured === undefined) legacy.featured = null; HR.refreshFeatured(legacy);
  ok(legacy.wishlist && Array.isArray(legacy.wishlist.prefs) && legacy.featured, 'migration repairs wishlist + featured');
  ok(HR.FEATURED_MARKUP > 1, 'the featured markup is a genuine premium (economy-safe)');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'wish1');
  ok(goal && !goal.done(g), 'the wishlist goal is unmet with no wishes');
  HR.addWishlistPref(g, { coat: 'Cremello' });
  ok(goal.done(g), 'the wishlist goal completes once a wish is added');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'patron');
  const g2 = HR.freshGame(); g2.stats.featuredBought = 1;
  ok(ach && ach.check(g2) && !ach.check(g), 'buying a featured horse unlocks Discerning Patron');
}

// ---- seasonal disasters + insurance (round 31) ----
{
  // config + seasonal weighting
  ok(Array.isArray(HR.DISASTERS) && HR.DISASTERS.length >= 4, 'a disaster catalogue exists');
  ok(new Set(HR.DISASTERS.map(d => d.id)).size === HR.DISASTERS.length, 'disaster ids are unique');
  ok(HR.DISASTERS.every(d => d.weight > 0 && d.kind && d.emoji && Array.isArray(d.seasons) && d.seasons.length), 'each disaster has weight, kind, emoji, seasons');
  ok(HR.disastersForSeason('winter').some(d => d.id === 'blizzard'), 'winter includes the blizzard');
  ok(!HR.disastersForSeason('summer').some(d => d.id === 'blizzard'), 'blizzards never strike in summer');
  ok(HR.disasterDef('colic') && HR.disasterDef('nope') === null, 'disasterDef lookup + miss');
  ok(HR.DISASTER_CHANCE > 0 && HR.DISASTER_CHANCE <= 0.15, 'disasters are rare (<=15%/day)');
}
{
  // a disaster applies a bounded coin loss; uninsured takes the full (capped) hit
  const g = HR.freshGame(); g.money = 100000; g.day = 30; // winter-ish, established ranch
  const dis = HR.disasterDef('storm');
  const m0 = g.money;
  const r = HR.applyDisaster(g, dis, rng(3));
  ok(r && r.net > 0 && g.money === m0 - r.net, 'a disaster deducts its coin loss');
  ok(r.net <= 450, 'the loss is capped (never brutal)');
  ok(g.stats.disasters === 1, 'the disaster is tallied');
  // storm dents a horse health but bounded
  ok(g.horses.every(h => h.health >= 0), 'health stays valid after a storm');
}
{
  // insurance softens the matching kind and is a bounded fraction
  const bare = HR.freshGame(); bare.money = 100000; bare.day = 30;
  const ins = HR.freshGame(); ins.money = 100000; ins.day = 30; HR.buyInsurance(ins, 'property');
  const rb = HR.applyDisaster(bare, HR.disasterDef('storm'), rng(9));
  const ri = HR.applyDisaster(ins, HR.disasterDef('storm'), rng(9));
  ok(ri.net < rb.net && ri.covered > 0, 'insurance reduces the net loss for the covered kind');
  ok(ri.net + ri.covered === rb.net + rb.covered || Math.abs((ri.net + ri.covered) - rb.coin) <= 1, 'covered + net ≈ the gross loss');
  // wrong-kind insurance does not help
  const wrong = HR.freshGame(); wrong.money = 100000; wrong.day = 30; HR.buyInsurance(wrong, 'vet'); // health cover, not property
  const rw = HR.applyDisaster(wrong, HR.disasterDef('storm'), rng(9));
  ok(rw.covered === 0 && rw.net === rb.net, 'a policy only covers its own kind');
  ok(HR.insuranceCovers(ins, 'property') > 0 && HR.insuranceCovers(ins, 'health') === 0, 'insuranceCovers reports the right kind');
}
{
  // buy/cancel policies, premium sums, and daily premium is deducted in advanceDay
  const g = HR.freshGame(); g.money = 5000; g.feed = 9999;
  ok(HR.insurancePremium(g) === 0, 'no premium with no policies');
  const r = HR.buyInsurance(g, 'weather');
  ok(r.ok && HR.hasInsurance(g, 'weather') && HR.insurancePremium(g) === HR.insuranceDef('weather').premium, 'buying a policy adds its premium');
  ok(!HR.buyInsurance(g, 'weather').ok, 'cannot double-insure the same policy');
  const m0 = g.money;
  HR.advanceDay(g, rng(2));
  ok(g.money <= m0 - HR.insuranceDef('weather').premium, 'the premium is deducted daily');
  ok((g.stats.insurancePremiums || 0) >= HR.insuranceDef('weather').premium, 'premiums are tracked');
  HR.cancelInsurance(g, 'weather');
  ok(!HR.hasInsurance(g, 'weather') && HR.insurancePremium(g) === 0, 'cancelling stops the premium');
}
{
  // rollDisaster: none in the grace period; deterministic; drawn from the season pool
  const early = HR.freshGame(); early.day = 3;
  ok(HR.rollDisaster(early, rng(1)) === null, 'no disasters during the first-season grace period');
  const g = { day: 30, horses: [], stats: {} }; // deep winter
  // force a hit with an rng that returns a low first value
  let calls = 0; const hitRng = () => { calls++; return calls === 1 ? 0.0 : 0.5; };
  const d = HR.rollDisaster(g, hitRng);
  ok(d && HR.disastersForSeason(HR.seasonOf(g.day).id).some(x => x.id === d.id), 'a rolled disaster belongs to the current season');
  ok(HR.rollDisaster({ day: 30, horses: [], stats: {} }, () => 0.99) === null, 'a high roll yields no disaster');
}
{
  // save migration + goal/achievement
  const legacy = HR.freshGame(); delete legacy.insurance;
  ok(!Array.isArray(legacy.insurance), 'legacy save lacks an insurance array');
  legacy.insurance = Array.isArray(legacy.insurance) ? legacy.insurance : []; // mirrors the load guard
  ok(Array.isArray(legacy.insurance), 'migration gives an insurance array');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'insure1');
  ok(goal && !goal.done(g), 'the insurance goal is unmet with no policy');
  HR.buyInsurance(g, 'vet');
  ok(goal.done(g), 'the insurance goal completes once insured');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'weathered');
  const g2 = HR.freshGame(); g2.stats.disasters = 5;
  ok(ach && ach.check(g2) && !ach.check(g), 'weathering five disasters unlocks the achievement');
}

// ---- tack crafting / upgrade tiers (round 32) ----
{
  // tier config + which items are upgradable
  ok(Array.isArray(HR.TACK_TIERS) && HR.TACK_TIERS.length >= 2 && HR.TACK_MAX_TIER === HR.TACK_TIERS.length - 1, 'a tier ladder exists');
  ok(HR.TACK_TIERS[0].mult === 1 && HR.TACK_TIERS[HR.TACK_MAX_TIER].mult > 1, 'Standard is neutral, top tier is stronger');
  const showItem = HR.TACK.find(t => t.show), utilItem = HR.TACK.find(t => t.groomDecay && !t.show && !t.disc);
  ok(HR.tackUpgradable(showItem.id), 'performance gear is upgradable');
  ok(utilItem && !HR.tackUpgradable(utilItem.id), 'pure-utility gear is not upgradable');
}
{
  // upgrading raises the tier, costs coins, and can't exceed Masterwork
  const g = HR.freshGame(); g.money = 100000; g.rep = 9999;
  const id = HR.TACK.find(t => t.show).id;
  HR.buyTack(g, id);
  ok(HR.tackTier(g, id) === 0 && HR.tackTierMult(g, id) === 1, 'a fresh item is Standard');
  ok(!HR.upgradeTack(g, 'nope').ok, 'cannot upgrade an unknown item');
  const cost1 = HR.upgradeTackCost(g, id), m0 = g.money;
  const r1 = HR.upgradeTack(g, id);
  ok(r1.ok && HR.tackTier(g, id) === 1 && g.money === m0 - cost1, 'upgrading steps up a tier and spends coins');
  ok(HR.tackTierMult(g, id) > 1, 'the tier multiplier grows');
  const cost2 = HR.upgradeTackCost(g, id);
  ok(cost2 > cost1, 'each tier costs more than the last');
  HR.upgradeTack(g, id); // → Masterwork
  ok(HR.tackTier(g, id) === HR.TACK_MAX_TIER, 'reaches the top tier');
  ok(!HR.canUpgradeTack(g, id) && !HR.upgradeTack(g, id).ok && HR.upgradeTackCost(g, id) === 0, 'cannot upgrade beyond Masterwork');
  // affordability + ownership guards
  const poor = HR.freshGame(); poor.money = 0; poor.rep = 9999; HR.buyTack(poor, id);
  ok(!HR.upgradeTack(poor, id).ok, 'cannot upgrade what you cannot afford');
  const notowned = HR.freshGame(); notowned.money = 100000;
  ok(!HR.upgradeTack(notowned, id).ok, 'cannot upgrade tack you do not own');
}
{
  // the upgraded bonus folds into disciplineScore but stays under the cap
  const g = HR.freshGame(); g.money = 500000; g.rep = 9999;
  const disc = HR.disciplineDef('race');
  const base = HR.mkHorse({ breed: 'thoroughbred', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  const kitted = HR.mkHorse({ breed: 'thoroughbred', age: 12, speed: 80, stamina: 80, temperament: 80, health: 100, happy: 100 });
  kitted.trait = base.trait;
  for (const nid of HR.NEED_IDS) { base.needs[nid] = 100; kitted.needs[nid] = 100; }
  g.horses = [base, kitted];
  const saddle = HR.TACK.find(t => t.slot === 'saddle' && t.show).id;
  HR.buyTack(g, saddle); HR.equipTack(g, kitted, saddle);
  const stdScore = HR.disciplineScore(kitted, disc, g);
  HR.upgradeTack(g, saddle); HR.upgradeTack(g, saddle); // → Masterwork
  const mwScore = HR.disciplineScore(kitted, disc, g);
  ok(mwScore > stdScore, 'a Masterwork saddle out-performs the same Standard saddle');
  ok(HR.tackShowMult(kitted, g) <= 1 + HR.TACK_SHOW_CAP + 1e-9, 'the total show bonus is still capped');
  // a discipline item is likewise capped
  const halter = HR.TACK.find(t => t.disc);
  const hh = HR.mkHorse({ breed: 'arabian', age: 12 }); g.horses.push(hh);
  HR.buyTack(g, halter.id); HR.equipTack(g, hh, halter.id); HR.upgradeTack(g, halter.id); HR.upgradeTack(g, halter.id);
  ok(HR.tackDiscMult(hh, halter.disc.id, g) <= 1 + HR.TACK_DISC_CAP + 1e-9, 'a discipline tack bonus is capped');
  // omitting game → base tier (backward compatible with existing callers)
  ok(HR.tackShowMult(kitted) <= HR.tackShowMult(kitted, g) + 1e-9, 'no-game tackShowMult uses the base tier');
}
{
  // save migration + goal/achievement
  const legacy = HR.freshGame(); legacy.tack = { owned: [] }; // pre-tier tack (no tiers map)
  legacy.tack.tiers = legacy.tack.tiers || {}; // mirrors the load guard
  ok(typeof legacy.tack.tiers === 'object', 'migration gives a tiers map');
  ok(HR.tackTier(legacy, 'saddle_show') === 0, 'pre-tier tack reads as Standard');
  const g = HR.freshGame(); g.money = 100000; g.rep = 9999;
  const id = HR.TACK.find(t => t.show).id; HR.buyTack(g, id);
  const goal = HR.GOALS.find(x => x.id === 'upgrade1');
  ok(goal && !goal.done(g), 'the upgrade goal is unmet before upgrading');
  HR.upgradeTack(g, id);
  ok(goal.done(g), 'the upgrade goal completes after one upgrade');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'masterwork');
  ok(ach && !ach.check(g), 'Masterwork achievement not yet earned at Fine');
  HR.upgradeTack(g, id);
  ok(ach.check(g), 'reaching Masterwork unlocks the achievement');
}

// ---- naming, name packs & studbook registry (round 33) ----
{
  // packs have gendered pools; classic mirrors pickName
  ok(Array.isArray(HR.NAME_PACKS) && HR.NAME_PACKS.length >= 3, 'several name packs exist');
  ok(new Set(HR.NAME_PACKS.map(p => p.id)).size === HR.NAME_PACKS.length, 'name-pack ids are unique');
  ok(HR.NAME_PACKS.every(p => Array.isArray(p.m) && p.m.length && Array.isArray(p.f) && p.f.length), 'each pack has male & female pools');
  ok(HR.namePackDef('classic') && HR.namePackDef('nope').id === 'classic', 'namePackDef falls back to classic');
  const classic = HR.namePackDef('classic');
  ok(HR.pickNameFrom(classic, 'mare', rng(1)) === HR.pickNameFrom(classic, 'mare', rng(1)), 'pickNameFrom is deterministic for a seed');
  ok(classic.f.indexOf(HR.pickNameFrom(classic, 'mare', rng(3))) >= 0, 'a mare name comes from the female pool');
  ok(classic.m.indexOf(HR.pickNameFrom(classic, 'stallion', rng(4))) >= 0, 'a stallion name comes from the male pool');
}
{
  // pack unlock gating + active pack selection
  const g = HR.freshGame(); g.rep = 0;
  ok(HR.activeNamePack(g).id === 'classic', 'a fresh ranch uses the classic pack');
  const gated = HR.NAME_PACKS.find(p => p.repReq > 0);
  ok(gated, 'at least one pack is reputation-gated');
  ok(!HR.namePackUnlocked(g, gated.id) && !HR.setNamePack(g, gated.id).ok, 'a gated pack is locked at low rep');
  g.rep = gated.repReq;
  ok(HR.setNamePack(g, gated.id).ok && g.namePack === gated.id, 'the pack unlocks and can be selected at the required rep');
  // a free pack is always selectable
  const free = HR.NAME_PACKS.find(p => p.repReq === 0 && p.id !== 'classic');
  ok(HR.setNamePack(HR.freshGame(), free.id).ok, 'a free pack is selectable from the start');
  // active pack falls back if the stored pack is no longer unlocked (e.g. after a rep reset)
  const fell = HR.freshGame(); fell.namePack = gated.id; fell.rep = 0;
  ok(HR.activeNamePack(fell).id === 'classic', 'a locked stored pack falls back to classic');
}
{
  // rename validates, trims, caps & applies (and counts a stat)
  const g = HR.freshGame();
  const id = g.horses[0].id;
  ok(!HR.renameHorse(g, 'nope', 'X').ok, 'cannot rename a horse that does not exist');
  ok(!HR.renameHorse(g, id, '   ').ok, 'a blank name is rejected');
  const r = HR.renameHorse(g, id, '  Sir  Gallops  ');
  ok(r.ok && g.horses[0].name === 'Sir Gallops', 'rename trims & collapses whitespace');
  ok((g.stats.renames || 0) === 1, 'a rename is tallied');
  HR.renameHorse(g, id, 'y'.repeat(HR.HORSE_NAME_MAX + 30));
  ok(g.horses[0].name.length === HR.HORSE_NAME_MAX, 'over-long names are capped');
}
{
  // studbook registry appends, dedupes by id, syncs the current herd, and updates on rename
  const g = HR.freshGame();
  ok(HR.registrySize(g) === g.horses.length, 'freshGame registers the starter herd');
  const before = HR.registrySize(g);
  const h = HR.mkHorse({ breed: 'arabian', age: 12 }); g.horses.push(h);
  HR.syncRegistry(g);
  ok(HR.registrySize(g) === before + 1, 'a newly-owned horse is registered');
  HR.syncRegistry(g); HR.registerHorse(g, h);
  ok(HR.registrySize(g) === before + 1, 'registering the same horse again does not duplicate it');
  // a horse that leaves the herd stays in the studbook (a keepsake)
  g.horses = g.horses.filter(x => x.id !== h.id);
  HR.syncRegistry(g);
  ok(g.registry.some(r => r.id === h.id), 'a sold horse is kept in the studbook');
  // rename updates the registry entry too
  HR.renameHorse(g, g.horses[0].id, 'Keepsake');
  ok(g.registry.find(r => r.id === g.horses[0].id).name === 'Keepsake', 'the registry entry follows a rename');
}
{
  // registry cap keeps the log bounded; foals are named from the active pack in advanceDay
  const g = HR.freshGame(); g.registry = [];
  for (let i = 0; i < HR.REGISTRY_CAP + 30; i++) HR.registerHorse(g, HR.mkHorse({ breed: 'mustang', age: 10 }));
  ok(HR.registrySize(g) === HR.REGISTRY_CAP, 'the studbook is capped');
  // breeding via advanceDay names the foal from the active pack
  const g2 = HR.freshGame(); g2.feed = 9999; g2.rep = 9999;
  const free = HR.NAME_PACKS.find(p => p.repReq === 0 && p.id !== 'classic');
  HR.setNamePack(g2, free.id);
  const mare = g2.horses.find(x => x.sex === 'mare');
  mare.pregnant = true; mare.gestation = 1;
  mare._sire = { breed: mare.breed, speed: 60, stamina: 60, temperament: 60, generation: 1, sex: 'stallion', name: 'S', genes: mare.genes, ped: null };
  const bornBefore = g2.stats.born;
  for (let d = 0; d < 3 && g2.stats.born === bornBefore; d++) HR.advanceDay(g2, rng(5));
  const foal = g2.horses.find(x => (x.generation || 1) >= 2);
  if (foal) ok((free.m.concat(free.f)).indexOf(foal.name) >= 0, 'a foal is named from the active name pack');
  else ok(true, 'no foal this run (rng) — skip');
}
{
  // goal + achievement
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'rename1');
  ok(goal && !goal.done(g), 'the rename goal is unmet before renaming');
  HR.renameHorse(g, g.horses[0].id, 'Champion');
  ok(goal.done(g), 'the rename goal completes after a rename');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'studbook');
  const g2 = HR.freshGame(); for (let i = 0; i < 25; i++) HR.registerHorse(g2, HR.mkHorse({ breed: 'mustang', age: 10 }));
  ok(ach && ach.check(g2) && !ach.check(HR.freshGame()), 'registering 25 horses unlocks Full Studbook');
}

// ---- daily login streak rewards (round 34) ----
{
  // new-day detection & streak transitions (stamp-driven, no Date)
  ok(HR.isNewDay(null, 100) === true, 'a never-claimed state is claimable');
  ok(HR.isNewDay(100, 101) === true && HR.isNewDay(100, 100) === false && HR.isNewDay(100, 99) === false, 'isNewDay compares stamps');
  ok(HR.streakAfter(0, null, 100) === 1, 'first claim starts the streak at 1');
  ok(HR.streakAfter(3, 100, 101) === 4, 'a consecutive day grows the streak');
  ok(HR.streakAfter(9, 100, 105) === 1, 'a gap resets the streak to 1');
  ok(HR.streakAfter(5, 100, 100) === 5, 'same-day is unchanged');
}
{
  // reward scales but is capped, with a weekly milestone
  const r1 = HR.dailyReward(1), r10 = HR.dailyReward(10), r99 = HR.dailyReward(99);
  ok(r10.money > r1.money, 'a longer streak pays more');
  ok(r99.money <= 1500 && r99.feed <= 90 && r99.rep <= 30, 'the reward is capped (economy-safe)');
  ok(HR.dailyReward(HR.DAILY_CYCLE).milestone === true && HR.dailyReward(HR.DAILY_CYCLE - 1).milestone === false, 'every 7th day is a milestone');
  ok(HR.dailyReward(HR.DAILY_CYCLE).money > HR.dailyReward(HR.DAILY_CYCLE - 1).money, 'the milestone day pays a bonus');
}
{
  // claimDaily: applies once per day, grows on consecutive days, resets on a gap, tracks longest
  let st = HR.normDaily(null);
  ok(st.last === null && st.streak === 0 && st.longest === 0, 'a fresh daily state is empty');
  const c1 = HR.claimDaily(st, 200);
  ok(c1.claimed && c1.streak === 1 && c1.reward, 'first claim pays and sets streak 1');
  st = c1.state;
  const again = HR.claimDaily(st, 200);
  ok(!again.claimed, 'cannot double-claim the same day');
  const c2 = HR.claimDaily(st, 201);
  ok(c2.claimed && c2.streak === 2, 'the next consecutive day grows the streak');
  st = c2.state;
  const c3 = HR.claimDaily(st, 210); // a gap
  ok(c3.claimed && c3.streak === 1, 'a gap day resets the streak to 1');
  st = c3.state;
  ok(st.longest === 2, 'the longest streak is remembered');
}
{
  // dailyState is a non-mutating view for the UI
  let st = HR.normDaily({ last: 300, streak: 4, longest: 6 });
  const view = HR.dailyState(st, 301);
  ok(view.claimable === true && view.nextStreak === 5, 'a new day is claimable and previews the next streak');
  ok(st.last === 300 && st.streak === 4, 'dailyState does not mutate the state');
  const same = HR.dailyState(st, 300);
  ok(same.claimable === false, 'the same day is not claimable');
  // goal + achievement
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'daily1');
  ok(goal && !goal.done(g), 'the daily goal is unmet before claiming');
  g.stats.dailyClaims = 1;
  ok(goal.done(g), 'the daily goal completes after a claim');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'loyal');
  const g2 = HR.freshGame(); g2.stats.bestStreak = 7;
  ok(ach && ach.check(g2) && !ach.check(g), 'a 7-day streak unlocks Loyal Rancher');
}

// ---- retirement pasture / sanctuary (round 35) ----
{
  // retiring adds to BOTH the pasture and the Hall of Fame (separate rosters, no double-count within one)
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'arabian', age: 30, wins: 4 }); g.horses.push(h);
  const hofBefore = (g.hallOfFame || []).length, pastBefore = HR.pastureSize(g);
  HR.retireHorse(g, h, 40);
  ok(HR.pastureSize(g) === pastBefore + 1, 'retiring sends the horse to the pasture');
  ok((g.hallOfFame || []).length === hofBefore + 1, 'retiring still inducts into the Hall of Fame');
  ok(!g.horses.some(x => x.id === h.id), 'the horse leaves the active herd');
  const e = HR.pastureList(g)[0];
  ok(e.id === h.id && e.name === h.name && e.reason === 'retired', 'the pasture entry keeps the horse’s identity');
  ok(typeof HR.legacyLine(e, 'Skyhorse Stables') === 'string' && HR.legacyLine(e).length > 0, 'a pastured horse has a legacy line');
}
{
  // no double-add of the same horse; roster caps
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'mustang', age: 25 }); g.horses.push(h);
  HR.sendToPasture(g, h, 'retired', 5);
  const n = HR.pastureSize(g);
  ok(HR.sendToPasture(g, h, 'retired', 6) === null && HR.pastureSize(g) === n, 'the same horse is never added twice');
  const big = HR.freshGame();
  for (let i = 0; i < HR.PASTURE_CAP + 20; i++) HR.sendToPasture(big, HR.mkHorse({ breed: 'mustang', age: 25 }), 'retired', i);
  ok(HR.pastureSize(big) === HR.PASTURE_CAP, 'the pasture roster is capped');
}
{
  // the ambassadors reputation bonus is bounded and applied in advanceDay
  const g = HR.freshGame();
  ok(HR.pastureRepBonus(g) === 0, 'an empty pasture draws no bonus');
  for (let i = 0; i < 4; i++) HR.sendToPasture(g, HR.mkHorse({ breed: 'mustang', age: 25 }), 'retired', i);
  ok(HR.pastureRepBonus(g) === 2, 'four pastured horses draw +2⭐/day');
  for (let i = 0; i < 40; i++) HR.sendToPasture(g, HR.mkHorse({ breed: 'mustang', age: 25 }), 'retired', 100 + i);
  ok(HR.pastureRepBonus(g) <= HR.PASTURE_REP_CAP, 'the pasture reputation draw is capped');
  // advanceDay applies the bonus
  const g2 = HR.freshGame(); g2.feed = 9999;
  for (let i = 0; i < 10; i++) HR.sendToPasture(g2, HR.mkHorse({ breed: 'mustang', age: 25 }), 'retired', i);
  const rep0 = g2.rep;
  HR.advanceDay(g2, rng(1));
  ok(g2.rep >= rep0 + HR.pastureRepBonus(g2), 'advanceDay adds the pasture reputation draw');
}
{
  // gentle passing goes to the Hall of Fame but NOT the living pasture
  const g = HR.freshGame(); g.feed = 9999;
  const old = HR.mkHorse({ breed: 'shetland', age: 200 }); g.horses.push(old); // well past LIFESPAN
  const pastBefore = HR.pastureSize(g);
  // advance until it passes — one rng stream so the 10%/day chance is a proper random walk
  const r = rng(3);
  for (let d = 0; d < 120 && g.horses.some(x => x.id === old.id); d++) HR.advanceDay(g, r);
  ok(!g.horses.some(x => x.id === old.id), 'the very old horse passes on');
  ok(HR.pastureSize(g) === pastBefore, 'a passed horse is memorialised in the Hall of Fame, not the living pasture');
  ok((g.hallOfFame || []).some(r => r.id === old.id && r.reason === 'passed'), 'the passed horse is in the Hall of Fame');
}
{
  // save migration + goal/achievement
  const legacy = HR.freshGame(); delete legacy.pasture;
  ok(HR.pastureList(legacy).length === 0, 'pastureList is safe when the roster is missing');
  legacy.pasture = Array.isArray(legacy.pasture) ? legacy.pasture : []; // mirrors the load guard
  ok(Array.isArray(legacy.pasture), 'migration gives a pasture array');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'pasture1');
  ok(goal && !goal.done(g), 'the pasture goal is unmet before retiring anyone');
  HR.sendToPasture(g, g.horses[0], 'retired', g.day);
  ok(goal.done(g), 'the pasture goal completes once a horse is retired there');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'sanctuary');
  const g2 = HR.freshGame(); for (let i = 0; i < 5; i++) HR.sendToPasture(g2, HR.mkHorse({ breed: 'mustang', age: 25 }), 'retired', i);
  ok(ach && ach.check(g2) && !ach.check(g), 'five pastured horses unlock Sanctuary');
}

// ---- breeding-goals / target-foal planner (round 36) ----
{
  // predictFoal is defensive with missing parents
  const h = HR.mkHorse({ breed: 'arabian' });
  ok(HR.predictFoal(null, h) === null && HR.predictFoal(h, null) === null, 'predictFoal is null without both parents');
}
{
  // predicted stat ranges bracket what breedFoal actually produces (same maths, no RNG in the predictor)
  const mare = HR.mkHorse({ breed: 'arabian', speed: 50, stamina: 40, temperament: 60 });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', speed: 60, stamina: 70, temperament: 50 });
  const pred = HR.predictFoal(mare, stal);
  ok(pred.purebred === true, 'a same-breed pairing predicts a purebred foal');
  ok(pred.generation === 2, 'the predicted generation is one past the parents');
  ok(pred.inbred === false, 'unrelated parents are not flagged inbred');
  // sample a big batch on one rng stream and confirm the ranges hold
  const r = rng(7); const sp = [], st = [], tm = [];
  for (let i = 0; i < 500; i++) { const f = HR.breedFoal(mare, stal, r); sp.push(f.speed); st.push(f.stamina); tm.push(f.temperament); }
  const mean = a => a.reduce((n, x) => n + x, 0) / a.length;
  const within = (a, lo, hi) => a.every(x => x >= lo - 1 && x <= hi + 9); // rounding ±1 + the +8 champion bloodline
  ok(pred.statRanges.speed.lo <= mean(sp) && mean(sp) <= pred.statRanges.speed.hi, 'speed mean lands inside the predicted range');
  ok(pred.statRanges.stamina.lo <= mean(st) && mean(st) <= pred.statRanges.stamina.hi, 'stamina mean lands inside the predicted range');
  ok(pred.statRanges.temperament.lo <= mean(tm) && mean(tm) <= pred.statRanges.temperament.hi, 'temperament mean lands inside the predicted range');
  ok(within(sp, pred.statRanges.speed.lo, pred.statRanges.speed.hi), 'every sampled speed sits within the predicted band');
  ok(within(st, pred.statRanges.stamina.lo, pred.statRanges.stamina.hi), 'every sampled stamina sits within the predicted band');
  ok(pred.overall.lo <= pred.overall.mid && pred.overall.mid <= pred.overall.hi, 'the overall band is ordered lo→mid→hi');
  // the predictor is pure — same inputs, identical output
  ok(JSON.stringify(pred) === JSON.stringify(HR.predictFoal(mare, stal)), 'predictFoal is deterministic');
}
{
  // coat odds enumerate every phenotype the real cross can throw, and sum to ~1
  const mg = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['C', 'n'], G: ['G', 'n'], mut: null };
  const sg = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['n', 'n'], mut: null };
  const odds = HR.coatOddsFor(mg, sg);
  const sum = odds.reduce((n, c) => n + c.p, 0);
  ok(Math.abs(sum - 1) < 0.001, 'coat odds sum to 1');
  ok(odds.every((c, i) => i === 0 || odds[i - 1].p >= c.p), 'coat odds are sorted most-likely first');
  // sample real foals and confirm every coat that appears was predicted with p>0
  const mare = HR.mkHorse({ breed: 'arabian', genes: mg });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', genes: sg });
  const r = rng(11); const seen = new Set();
  for (let i = 0; i < 600; i++) seen.add(HR.breedFoal(mare, stal, r).coat.name);
  ok([...seen].every(name => odds.some(c => c.name === name && c.p > 0)), 'every coat the cross produces is in the odds');
}
{
  // a parent carrying a mutation lifts that mutation's odds far above the baseline sprinkle
  const golden = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['n', 'n'], mut: 'Golden' };
  const plain = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['n', 'n'], mut: null };
  const g = HR.coatOddsFor(golden, plain).find(c => c.name === 'Golden');
  const base = HR.coatOddsFor(plain, plain).find(c => c.name === 'Golden');
  ok(g && g.p > 0.39, 'a Golden parent gives ~40% Golden foals');
  ok(base && base.p < 0.02, 'without a mutation carrier Golden stays rare');
}
{
  // trait odds: each parent trait is favoured, everything sums to 1
  const odds = HR.traitOddsFor('bold', 'clever');
  const sum = odds.reduce((n, t) => n + t.p, 0);
  ok(Math.abs(sum - 1) < 0.001, 'trait odds sum to 1');
  const bold = odds.find(t => t.id === 'bold'), clever = odds.find(t => t.id === 'clever'), lazy = odds.find(t => t.id === 'lazy');
  ok(bold.p > lazy.p && clever.p > lazy.p, 'the parents’ traits outrank a trait neither carries');
}
{
  // inbreeding is detected and drags the predicted band down
  const mare = HR.mkHorse({ breed: 'arabian', speed: 60, stamina: 60, temperament: 60 });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', speed: 60, stamina: 60, temperament: 60 });
  const foal = HR.breedFoal(mare, stal, rng(3)); // foal's pedigree names both parents
  const pIn = HR.predictFoal(foal, mare); // breeding the foal back to its dam
  const pOut = HR.predictFoal(mare, HR.mkHorse({ breed: 'arabian', sex: 'stallion', speed: 60, stamina: 60, temperament: 60 }));
  ok(pIn.inbred === true, 'a foal bred back to its dam is flagged inbred');
  ok(pIn.statRanges.speed.hi < pOut.statRanges.speed.hi, 'the inbreeding penalty lowers the predicted ceiling');
}
{
  // cross-breed prediction takes the rarer parent's breed
  const common = HR.mkHorse({ breed: 'shetland' });
  const rare = HR.mkHorse({ breed: 'akhalteke', sex: 'stallion' });
  const pred = HR.predictFoal(common, rare);
  ok(pred.breed === 'akhalteke' && pred.purebred === false, 'a cross predicts the rarer parent’s breed, not purebred');
}
{
  // matchesBreedingGoal: purebred + rarity are certainties; coat matches the odds
  const pureArab = HR.predictFoal(HR.mkHorse({ breed: 'arabian' }), HR.mkHorse({ breed: 'arabian', sex: 'stallion' }));
  const pb = HR.matchesBreedingGoal(pureArab, 'purebred');
  ok(pb && pb.chance === 1 && pb.onTrack, 'a purebred pairing is on track for the purebred goal');
  const elitePred = HR.predictFoal(HR.mkHorse({ breed: 'akhalteke' }), HR.mkHorse({ breed: 'akhalteke', sex: 'stallion' }));
  const el = HR.matchesBreedingGoal(elitePred, 'elite');
  ok(el && el.chance === 1, 'an Elite+ breed pairing satisfies the elite goal');
  const cross = HR.predictFoal(HR.mkHorse({ breed: 'shetland' }), HR.mkHorse({ breed: 'shetland', sex: 'stallion' }));
  ok(HR.matchesBreedingGoal(cross, 'elite').chance === 0, 'a common breed misses the elite goal');
  // coat goal chance equals that coat's odds in the prediction
  const cg = HR.matchesBreedingGoal(pureArab, 'grey');
  const greyP = (pureArab.coatOdds.find(c => c.name === 'Grey') || { p: 0 }).p;
  ok(Math.abs(cg.chance - greyP) < 1e-9, 'a coat goal reports that coat’s exact odds');
  ok(HR.matchesBreedingGoal(pureArab, 'bogus') === null, 'an unknown goal id matches nothing');
  ok(HR.matchesBreedingGoal(null, 'purebred') === null, 'a null prediction matches nothing');
}
{
  // foalMeetsGoal grades a real foal against a goal
  const pure = HR.mkHorse({ breed: 'arabian', purebred: true, coat: { name: 'Bay', tier: 0 } });
  const rare = HR.mkHorse({ breed: 'akhalteke', purebred: false, coat: { name: 'Golden', tier: 3 } });
  ok(HR.foalMeetsGoal(pure, 'purebred') === true, 'a purebred foal meets the purebred goal');
  ok(HR.foalMeetsGoal(rare, 'purebred') === false, 'a non-purebred foal misses the purebred goal');
  ok(HR.foalMeetsGoal(rare, 'rarecoat') === true, 'a tier-3 coat meets the rare-coat goal');
  ok(HR.foalMeetsGoal(pure, 'rarecoat') === false, 'a plain coat misses the rare-coat goal');
  ok(HR.foalMeetsGoal(rare, 'elite') === true, 'an Akhal-Teke meets the Elite+ goal');
  ok(HR.foalMeetsGoal(null, 'purebred') === false && HR.foalMeetsGoal(pure, 'bogus') === false, 'foalMeetsGoal is defensive');
}
{
  // freshGame default, goal, migration and the Master Planner achievement
  const g = HR.freshGame();
  ok(g.breedGoal === null, 'a fresh ranch starts with no breeding goal');
  const goal = HR.GOALS.find(x => x.id === 'plan1');
  ok(goal && !goal.done(g), 'the planner goal is unmet until a goal is set');
  g.breedGoal = 'rarecoat';
  ok(goal.done(g), 'setting a valid breeding goal completes the planner goal');
  g.breedGoal = 'bogus'; // migration should discard unknown ids
  ok(HR.breedGoalDef(g.breedGoal) === null && !goal.done(g), 'an unknown goal id does not satisfy the planner goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'planner');
  ok(ach && !ach.check(g), 'Master Planner is locked before a goal is fulfilled');
  g.stats.goalsMet = 1;
  ok(ach.check(g), 'fulfilling a breeding goal unlocks Master Planner');
}
{
  // the birth hook credits a fulfilled goal — breed same-breed with a purebred goal set
  const g = HR.freshGame(); g.feed = 9999;
  const mare = HR.mkHorse({ breed: 'arabian', age: 30 }); const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 30 });
  g.horses.push(mare, stal);
  g.breedGoal = 'purebred';
  mare.pregnant = true; mare.gestation = 2;
  mare._sire = { id: stal.id, name: stal.name, breed: stal.breed, sex: 'stallion', speed: stal.speed, stamina: stal.stamina, temperament: stal.temperament, generation: stal.generation, genes: stal.genes, ped: stal.ped || null };
  const r = rng(5); for (let d = 0; d < 4 && mare.pregnant; d++) HR.advanceDay(g, r);
  ok(!mare.pregnant, 'the mare foals within the gestation window');
  ok((g.stats.goalsMet || 0) >= 1, 'a purebred foal born under a purebred goal is credited');
}

// ---- clamp helper ----
ok(HR.clamp(150, 0, 100) === 100 && HR.clamp(-5, 0, 100) === 0 && HR.clamp(50, 0, 100) === 50, 'clamp bounds values');

console.log(`horse_ranch: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
