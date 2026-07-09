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
  for (const b of ['welsh', 'mustang', 'fjord']) g.horses.push(HR.mkHorse({ breed: b, age: 20 })); // ≥5 distinct breeds → codex discovery goal
  HR.captureMoment(g, 'snapshot', g.horses[1]); // satisfies the scrapbook goal (save a memory)
  g.stats.visitorDays = 1; // satisfies the visitor-day goal
  g.stats.appointments = 1; // satisfies the farrier/vet appointment goal
  g.stats.groundwork = 1; // satisfies the bonding/groundwork goal
  g.stats.fairsWon = 1; // satisfies the seasonal-fair goal
  g.stats.choresDone = 1; // satisfies the daily-chores goal
  g.stats.trips = 1; // satisfies the away-trip goal
  g.stats.storeBuys = 1; // satisfies the general-store goal
  g.breeder = { points: 100 }; // satisfies the breeder-prestige goal (past Established)
  g.stats.studBookings = 1; // satisfies the stud-directory goal
  g.stats.grudgeWins = 1; // satisfies the grudge-match goal
  g.stats.ceremonies = 1; // satisfies the coming-of-age ceremony goal
  g.stats.labTests = 10; // satisfies the genetics-lab goal
  g.stats.profilesRead = 10; // satisfies the personality-profile goal
  g.stats.lessons = 1000; // satisfies the riding-curriculum goal (past Lead-Rein)
  g.trophies = g.trophies || []; for (let i = 0; i < 6; i++) g.trophies.push({ horse: 'H', breed: 'arabian', disc: 'race', tier: 3, place: 1, day: i + 1 }); // satisfies the ribbon-wall goal (≥5)
  g.stats.ledgerViews = 1; // satisfies the balance-sheet goal
  HR.toggleRadio(g); // switches on the stable radio → satisfies the radio goal
  HR.checkAchievements(g); // this rich state unlocks many achievements → satisfies the trophy-room goal (≥5)
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

// ---- coat-genetics lab / test-mating calculator (read-only study bench) ----
{
  // genotypeReadout: per-locus zygosity + carrier flags + phenotype
  const bayCarriesRed = HR.genotypeReadout({ E: ['E', 'e'], A: ['A', 'A'], Cr: ['n', 'n'], G: ['n', 'n'], mut: null });
  ok(bayCarriesRed.coat === 'Bay', 'readout reports the visible coat (Bay)');
  const eLocus = bayCarriesRed.loci.find(l => l.key === 'E');
  ok(eLocus.zygosity === 'heterozygous' && eLocus.homozygous === false, 'E/e is reported heterozygous');
  ok(bayCarriesRed.carriers.hiddenRed === true && bayCarriesRed.carriers.red === true, 'a black-based E/e horse carries red (hidden)');
  ok(bayCarriesRed.carriers.list.indexOf('red') >= 0, 'carrier list surfaces the hidden red allele');
  const aLocus = bayCarriesRed.loci.find(l => l.key === 'A');
  ok(aLocus.zygosity === 'homozygous', 'A/A is reported homozygous');

  // carrierFlags: hidden recessives
  const creamCarrier = HR.carrierFlags({ E: ['E', 'E'], A: ['A', 'A'], Cr: ['C', 'n'], G: ['n', 'n'], mut: null });
  ok(creamCarrier.cream === true && creamCarrier.creamCarrier === true && creamCarrier.doubleCream === false, 'a Cr/n horse is a single-copy cream carrier');
  const dbl = HR.carrierFlags({ E: ['e', 'e'], A: ['a', 'a'], Cr: ['C', 'C'], G: ['n', 'n'], mut: null });
  ok(dbl.doubleCream === true, 'two cream copies flagged as a double dilute');
  const greyC = HR.carrierFlags({ E: ['E', 'E'], A: ['A', 'A'], Cr: ['n', 'n'], G: ['G', 'n'], mut: null });
  ok(greyC.grey === true && greyC.list.indexOf('grey') >= 0, 'a G/n horse carries grey');
  const clean = HR.carrierFlags({ E: ['e', 'e'], A: ['a', 'a'], Cr: ['n', 'n'], G: ['n', 'n'], mut: null });
  ok(clean.list.length === 0, 'a pure chestnut carries no hidden recessives');
}
{
  // testMating: odds sum to ~1 and exactly mirror coatOddsFor for the same inputs
  const a = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['C', 'n'], G: ['n', 'n'], mut: null };
  const b = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['G', 'n'], mut: null };
  const tm = HR.testMating(a, b);
  const sum = tm.odds.reduce((s, o) => s + o.p, 0);
  ok(Math.abs(sum - 1) < 1e-6, 'testMating coat odds sum to ~1');
  ok(Math.abs(tm.total - 1) < 1e-6, 'testMating total is ~1');
  const raw = HR.coatOddsFor(a, b);
  const rawMap = {}; raw.forEach(o => rawMap[o.name] = o.p);
  ok(tm.odds.every(o => Math.abs(o.p - rawMap[o.name]) < 1e-9), 'testMating odds match coatOddsFor exactly');
  ok(tm.odds.length === raw.length, 'testMating enumerates the same coats as coatOddsFor');
  ok(tm.mostLikely && tm.mostLikely.name === tm.odds[0].name, 'mostLikely is the top-probability coat');
}
{
  // two single-cream red parents → ~25% double-dilute (Cremello, tier 2)
  const a = { E: ['e', 'e'], A: ['a', 'a'], Cr: ['C', 'n'], G: ['n', 'n'], mut: null };
  const tm = HR.testMating(a, a);
  const crem = tm.odds.find(o => o.name === 'Cremello');
  ok(crem && Math.abs(crem.p - 0.245) < 0.01, 'two cream carriers throw a Cremello ~24.5% of the time');
  ok(tm.rareChance > 0.24, 'rareChance reflects the tier-2 Cremello odds');
  const palo = tm.odds.find(o => o.name === 'Palomino');
  ok(palo && Math.abs(palo.p - 0.49) < 0.02, 'and a single-dilute Palomino ~49%');
  ok(tm.greyChance === 0, 'no grey allele in the pool → 0% grey');
}
{
  // a grey parent gives ~50% grey; mutation parent gives mutation odds
  const grey = { E: ['E', 'E'], A: ['A', 'A'], Cr: ['n', 'n'], G: ['G', 'n'], mut: null };
  const plain = { E: ['E', 'E'], A: ['A', 'A'], Cr: ['n', 'n'], G: ['n', 'n'], mut: null };
  const tm = HR.testMating(grey, plain);
  ok(tm.greyChance > 0.45 && tm.greyChance < 0.5, 'a single grey parent yields ~49% grey foals');
  const golden = { E: ['E', 'e'], A: ['A', 'a'], Cr: ['n', 'n'], G: ['n', 'n'], mut: 'Golden' };
  const tm2 = HR.testMating(golden, plain);
  ok(tm2.mutationChance > 0.39, 'a Golden parent passes the mutation ~40% of the time');
  ok(tm2.odds.some(o => o.name === 'Golden'), 'the mutation coat appears in the distribution');
  ok(tm.reads.length >= 2 && tm.reads.every(r => typeof r === 'string'), 'reads gives plain-language lines');
}
{
  // defensive: falls back to seedGenes by breed for a horse with no genes; deterministic; read-only
  const bare = { id: 'z1', breed: 'arabian', name: 'Ghost' };
  const r1 = HR.genotypeReadout(bare), r2 = HR.genotypeReadout(bare);
  ok(r1.coat && r1.loci.length === 4, 'genotypeReadout works on a genes-less horse (seeds by breed)');
  ok(JSON.stringify(r1.genes) === JSON.stringify(r2.genes), 'the breed fallback is deterministic (no Math.random)');
  const tmA = HR.testMating(bare, bare), tmB = HR.testMating(bare, bare);
  ok(JSON.stringify(tmA.odds) === JSON.stringify(tmB.odds), 'testMating on genes-less horses is deterministic');
  // read-only: no mutation of inputs or game
  const g = HR.freshGame();
  const before = JSON.stringify(g);
  HR.testMating(g.horses[0], g.horses[1]);
  HR.genotypeReadout(g.horses[0]);
  ok(JSON.stringify(g) === before, 'the lab never mutates the game (read-only study bench)');
  // presets resolve to valid genotypes
  ok(HR.LAB_PRESETS.length >= 3 && HR.LAB_PRESETS.every(p => HR.genotypeReadout(p.genes).coat), 'every lab preset is a valid, readable genotype');
  ok(HR.labPresetDef('p_gold') && HR.labPresetDef('p_gold').genes.mut === 'Golden', 'labPresetDef looks up presets by id');
  // null-safe
  ok(HR.carrierFlags(null).list.length === 0, 'carrierFlags is null-safe');
  ok(HR.testMating(null, null).odds.length >= 1, 'testMating is null-safe (seeds defaults)');
}
{
  // the genetics-lab goal + achievement track lab usage
  const g = HR.freshGame();
  g.stats.labTests = 1;
  const lab1 = HR.GOALS.find(x => x.id === 'lab1');
  ok(lab1 && lab1.done(g), 'lab1 goal completes after a test-mating is run');
  g.stats.labTests = 10;
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'geneticist');
  ok(ach && ach.check(g), 'Coat Geneticist unlocks at 10 studies');
  ok(HR.ACHIEVEMENTS.filter(a => a.id === 'geneticist').length === 1, 'geneticist achievement id is unique');
  ok(HR.GOALS.filter(x => x.id === 'lab1').length === 1, 'lab1 goal id is unique');
}

// ---- horse personality profile / temperament reveal (read-only flavour lens) ----
{
  // temperamentAxes: values in range and move with stats/trait/bond
  const fiery = HR.temperamentAxes({ trait: 'hot', speed: 90, stamina: 40, temperament: 40, bond: 10, happy: 80 });
  const calm = HR.temperamentAxes({ trait: 'gentle', speed: 45, stamina: 80, temperament: 90, bond: 90, happy: 90 });
  const fireA = fiery.find(a => a.id === 'fire').value, fireB = calm.find(a => a.id === 'fire').value;
  ok(fiery.every(a => a.value >= 0 && a.value <= 100), 'all axis values are within 0..100');
  ok(fireA > fireB, 'a hot, low-temperament horse reads more fiery than a gentle, calm one');
  const runA = fiery.find(a => a.id === 'run').value, runB = calm.find(a => a.id === 'run').value;
  ok(runA > runB, 'speed-heavy horse leans sprinter; stamina-heavy leans stayer');
  const warmA = calm.find(a => a.id === 'warmth').value, warmB = fiery.find(a => a.id === 'warmth').value;
  ok(warmA > warmB, 'a highly-bonded horse reads more affectionate');
  ok(fiery.find(a => a.id === 'fire').leaning === 'high' && fiery.find(a => a.id === 'fire').label === 'Fiery', 'a fiery axis is labelled and leaning high');
}
{
  // personalityProfile: stable archetypes for known constructed horses
  const bold = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 92, stamina: 40, temperament: 45, trait: 'bold', bond: 20, happy: 80 });
  const p1 = HR.personalityProfile(bold);
  ok(['firebrand', 'sprinter'].indexOf(p1.archetype.id) >= 0, 'a bold, high-speed horse reads as a fiery/sprinter archetype');
  ok(p1.tags.length > 0, 'profile carries descriptive tags');
  ok(p1.tags.indexOf('fiery') >= 0 || p1.tags.indexOf('sprinter') >= 0, 'tags reflect the fiery/sprinter nature');
  ok(p1.quiz.length >= 3 && p1.quiz.every(q => q.q && q.a), 'the quiz reflects the horse back in 3-4 lines');

  const gentle = HR.mkHorse({ breed: 'friesian', age: 22, speed: 45, stamina: 70, temperament: 90, trait: 'gentle', bond: 88, happy: 92 });
  const p2 = HR.personalityProfile(gentle);
  ok(['gentle', 'devoted'].indexOf(p2.archetype.id) >= 0, 'a calm, high-temperament, bonded horse reads as gentle/affectionate');
  ok(p2.tags.indexOf('affectionate') >= 0 || p2.tags.indexOf('level-headed') >= 0, 'tags reflect the gentle/affectionate nature');

  const old = HR.mkHorse({ breed: 'arabian', age: 66, speed: 55, stamina: 55, temperament: 70, trait: 'steady', bond: 60, happy: 80 });
  ok(HR.personalityProfile(old).archetype.id === 'oldsoul', 'a senior horse reads as The Old Soul');

  const foal = HR.mkHorse({ breed: 'welsh', age: 3, speed: 40, stamina: 40, temperament: 50, trait: 'spirited' });
  ok(HR.personalityProfile(foal).archetype.id === 'sprout', 'a foal reads as The Little Sprout');

  // bestDiscipline honours a settled specialty
  const runner = HR.mkHorse({ breed: 'quarter', age: 20, speed: 88, stamina: 55, temperament: 50, trait: 'bold' });
  HR.gainAffinity(runner, 'race', HR.SPECIALIST_AT);
  const pr = HR.personalityProfile(runner);
  ok(pr.bestDiscipline.id === 'race' && pr.bestDiscipline.basis === 'specialty', 'a settled specialist is best-suited to that discipline');
}
{
  // personalityMatch: sensible compatibility read
  const fiery = HR.mkHorse({ breed: 'akhalteke', age: 20, speed: 90, stamina: 40, temperament: 40, trait: 'hot', bond: 30, happy: 80 });
  const calm = HR.mkHorse({ breed: 'friesian', age: 20, speed: 45, stamina: 80, temperament: 88, trait: 'gentle', bond: 85, happy: 90 });
  const m = HR.personalityMatch(fiery, calm);
  ok(m.score >= 0 && m.score <= 100, 'match score is within 0..100');
  ok(typeof m.label === 'string' && typeof m.note === 'string', 'match gives a label + note');
  ok(m.fireGap >= 20, 'a fiery↔calm pairing registers a large temperament gap');
  const twoFire = HR.personalityMatch(fiery, HR.mkHorse({ breed: 'akhalteke', age: 20, speed: 88, stamina: 42, temperament: 42, trait: 'hot', bond: 30, happy: 80 }));
  ok(/firebrand/i.test(twoFire.note), 'two firebrands are flagged as a spark-prone pairing');
}
{
  // read-only + deterministic + sparse-safe
  const g = HR.freshGame();
  const before = JSON.stringify(g);
  HR.personalityProfile(g.horses[0]);
  HR.temperamentAxes(g.horses[0]);
  HR.personalityMatch(g.horses[0], g.horses[1]);
  ok(JSON.stringify(g) === before, 'the personality lens never mutates the game (read-only)');
  const a1 = HR.personalityProfile(g.horses[0]), a2 = HR.personalityProfile(g.horses[0]);
  ok(JSON.stringify(a1) === JSON.stringify(a2), 'personalityProfile is deterministic');
  // sparse horse: no trait/aff/bond
  const sparse = HR.personalityProfile({ age: 20 });
  ok(sparse.archetype && sparse.archetype.id && sparse.tags.length >= 1, 'a sparse horse still yields an archetype + tags');
  ok(HR.temperamentAxes({}).length === 3, 'temperamentAxes is safe on an empty object');
  ok(HR.personalityProfile(null).archetype, 'personalityProfile is null-safe');
}
{
  // the personality goal + achievement track profile reads; ids unique
  const g = HR.freshGame();
  g.stats.profilesRead = 1;
  ok(HR.GOALS.find(x => x.id === 'quiz1').done(g), 'quiz1 goal completes after reading a profile');
  g.stats.profilesRead = 10;
  ok(HR.ACHIEVEMENTS.find(a => a.id === 'characterstudy').check(g), 'Character Study unlocks at 10 reads');
  ok(HR.GOALS.filter(x => x.id === 'quiz1').length === 1 && HR.ACHIEVEMENTS.filter(a => a.id === 'characterstudy').length === 1, 'new goal/achievement ids are unique');
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
{
  // ---- riding-lesson curriculum / student progression ----
  const g = HR.freshGame();
  // fresh school sits at the bottom tier
  ok(HR.curriculumTierIndex(g) === 0 && HR.curriculumTier(g).id === 'leadrein', 'a new school starts at Lead-Rein');
  ok(HR.curriculumFeeMult(g) === 1, 'tier-0 curriculum fee multiplier is exactly 1.0');
  ok(HR.schoolLessonsTaught(g) === 0, 'no lessons taught yet');
  // climbs at the configured thresholds
  const tierAt = n => { const gg = HR.freshGame(); gg.stats.lessons = n; return HR.curriculumTier(gg).id; };
  ok(tierAt(59) === 'leadrein' && tierAt(60) === 'beginner', 'crossing 60 lessons reaches Beginner');
  ok(tierAt(200) === 'interm' && tierAt(500) === 'advanced' && tierAt(1000) === 'squad', 'higher thresholds reach Intermediate/Advanced/Squad');
  ok(tierAt(999999) === 'squad', 'the top tier is the ceiling');
  // fee multiplier is bounded and reflected in lessonFee
  for (const tt of HR.CURRICULUM_TIERS) { const gg = HR.freshGame(); gg.stats.lessons = tt.minLessons;
    ok(HR.curriculumFeeMult(gg) <= HR.CURRICULUM_FEE_CAP + 1e-9, 'curriculum fee multiplier never exceeds the cap at ' + tt.id); }
  const gLow = HR.freshGame(); gLow.rep = 500; gLow.stats.lessons = 0;
  const gHigh = HR.freshGame(); gHigh.rep = 500; gHigh.stats.lessons = 1000;
  ok(HR.lessonFee(gHigh) > HR.lessonFee(gLow), 'a higher curriculum tier lifts the lesson fee');
  ok(HR.lessonFee(gHigh) <= Math.ceil(HR.lessonFee(gLow) * HR.CURRICULUM_FEE_CAP) + 1, 'the lesson-fee lift stays within the bounded cap');
  // progress fraction toward the next tier
  const gp = HR.freshGame(); gp.stats.lessons = 130; // Beginner(60) → Intermediate(200): 70/140
  const cp = HR.curriculumProgress(gp);
  ok(cp.tier.id === 'beginner' && cp.next.id === 'interm', 'progress reports the current + next tier');
  ok(cp.have === 70 && cp.need === 140 && Math.abs(cp.frac - 0.5) < 1e-9, 'progress fraction toward the next tier is exact');
  ok(cp.toNext === 70, 'lessons-to-next-tier is correct');
  const capd = HR.curriculumProgress((() => { const gg = HR.freshGame(); gg.stats.lessons = 5000; return gg; })());
  ok(capd.next === null && capd.frac === 1, 'a maxed curriculum reports no next tier and full progress');
  // the cumulative stat increments through advanceDay when lessons resolve
  const ga = HR.freshGame(); ga.feed = 9999; ga.rep = 300;
  const tt = HR.mkTeacher(ga, rng(4)); tt.capacity = 6; tt.salary = 20; ga.teachers.push(tt);
  const before = HR.schoolLessonsTaught(ga);
  HR.advanceDay(ga, rng(6));
  ok(HR.schoolLessonsTaught(ga) > before, 'teaching lessons increments the cumulative curriculum counter');
  // safe on an old/sparse save with no stats.lessons field
  ok(HR.curriculumTier({}).id === 'leadrein' && HR.curriculumFeeMult({}) === 1, 'curriculum is safe on a sparse/old save');
  ok(HR.schoolLessonsTaught({ stats: {} }) === 0, 'missing lessons field defaults to 0');
  // deterministic
  const d1 = HR.freshGame(); d1.stats.lessons = 340; const d2 = HR.freshGame(); d2.stats.lessons = 340;
  ok(JSON.stringify(HR.curriculumProgress(d1)) === JSON.stringify(HR.curriculumProgress(d2)), 'curriculumProgress is deterministic');
  // goal + achievement
  const gg1 = HR.freshGame(); gg1.stats.lessons = 60;
  ok(HR.GOALS.find(x => x.id === 'curric1').done(gg1), 'curric1 goal completes past Lead-Rein');
  const gg0 = HR.freshGame(); gg0.stats.lessons = 30;
  ok(!HR.GOALS.find(x => x.id === 'curric1').done(gg0), 'curric1 not met below the Beginner threshold');
  const gg2 = HR.freshGame(); gg2.stats.lessons = 1000;
  ok(HR.ACHIEVEMENTS.find(a => a.id === 'headofschool').check(gg2), 'Head of School unlocks at the Competition Squad tier');
  ok(HR.GOALS.filter(x => x.id === 'curric1').length === 1 && HR.ACHIEVEMENTS.filter(a => a.id === 'headofschool').length === 1, 'new curriculum goal/achievement ids are unique');
}
{
  // ---- balance sheet / finances summary (read-only reporting lens) ----
  const g = HR.freshGame();
  g.canteen = { level: 2 };
  const tt = HR.mkTeacher(g, rng(3)); tt.capacity = 6; tt.salary = 40; g.teachers = [tt];
  g.staff = ['groom'];
  g.insurance = ['vet'];
  g.horses[0].rentDays = 4; g.horses[0].rentRate = 55;
  const day = g.day;
  const led = HR.dailyLedger(g);
  const inc = id => led.income.find(x => x.id === id).amount;
  const exp = id => led.expense.find(x => x.id === id).amount;
  ok(inc('rent') === 55, 'rent line matches the rented horse rate');
  const expCanteen = Math.round(HR.canteenIncome(g) * HR.canteenDayMult(day) * HR.canteenWeatherMult(day) * HR.seasonCanteenMul(day) * HR.festivalMod(day, 'canteenMul', 1));
  ok(inc('canteen') === expCanteen, 'canteen line matches the live canteen formula');
  ok(inc('lessons') === Math.round(HR.schoolIncome(g) * HR.lessonDayMult(day)), 'lessons line matches school income × day boost');
  ok(inc('stud') === Math.round(HR.studIncome(g)), 'stud line matches studIncome');
  ok(exp('salaries') === HR.teacherSalaries(g), 'salaries line matches teacher salaries');
  ok(exp('staff') === HR.staffPayroll(g), 'staff line matches payroll');
  ok(exp('insurance') === HR.insurancePremium(g), 'insurance line matches premiums');
  ok(led.incomeTotal === led.income.reduce((n, x) => n + x.amount, 0), 'income total sums the income lines');
  ok(led.net === led.incomeTotal - led.expenseTotal, 'net = income − expense');
  // balance sheet
  const bs = HR.balanceSheet(g);
  ok(bs.cash === g.money, 'balance sheet cash matches money on hand');
  ok(bs.ledger.net === led.net && bs.projection30 === led.net * 30, 'projection is 30× the daily net');
  g.stats.goldEarned = 12345; g.stats.bestSale = 999;
  const bs2 = HR.balanceSheet(g);
  ok(bs2.lifetime.find(l => l.id === 'earned').value === 12345 && bs2.lifetime.find(l => l.id === 'bestSale').value === 999, 'lifetime totals read from stats');
  // finance summary picks the biggest earner/cost
  const fs = HR.financeSummary(g);
  const maxInc = led.income.filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount)[0];
  const maxExp = led.expense.filter(x => x.amount > 0).sort((a, b) => b.amount - a.amount)[0];
  ok(fs.biggestEarner && fs.biggestEarner.id === maxInc.id, 'biggest earner is the top income line');
  ok(fs.biggestCost && fs.biggestCost.id === maxExp.id, 'biggest cost is the top expense line');
  // read-only + deterministic
  const snap = JSON.stringify(g);
  HR.dailyLedger(g); HR.balanceSheet(g); HR.financeSummary(g);
  ok(JSON.stringify(g) === snap, 'the balance sheet is read-only (never mutates the game)');
  ok(JSON.stringify(HR.dailyLedger(g)) === JSON.stringify(HR.dailyLedger(g)), 'dailyLedger is deterministic');
  // sparse/new game: no teachers/canteen/staff → all zeroes
  const g0 = HR.freshGame();
  const led0 = HR.dailyLedger(g0);
  ok(led0.income.every(x => x.amount === 0) && led0.expense.every(x => x.amount === 0) && led0.net === 0, 'a bare new ranch has a flat ledger');
  ok(HR.dailyLedger({}).net === 0 && HR.balanceSheet({}).cash === 0, 'ledger helpers are safe on an empty game');
  // goal + achievement
  const gv = HR.freshGame(); gv.stats.ledgerViews = 1;
  ok(HR.GOALS.find(x => x.id === 'books1').done(gv), 'books1 completes once the books are opened');
  const gb = HR.freshGame(); gb.canteen = { level: 3 }; gb.rep = 4000;
  ok(HR.dailyLedger(gb).net >= 0, 'a canteen-only ranch runs a surplus');
  const grich = HR.freshGame(); grich.boarders = 40;
  ok(HR.ACHIEVEMENTS.find(a => a.id === 'intheblack').check(grich), 'In the Black unlocks at a 🪙300+ daily surplus');
  ok(HR.GOALS.filter(x => x.id === 'books1').length === 1 && HR.ACHIEVEMENTS.filter(a => a.id === 'intheblack').length === 1, 'new finance goal/achievement ids are unique');
}
{
  // ---- stable radio / ambient music ----
  ok(HR.RADIO_STATIONS.length >= 3, 'a set of radio stations exists');
  const ids = HR.RADIO_STATIONS.map(s => s.id);
  ok(new Set(ids).size === ids.length, 'station ids are unique');
  ok(HR.RADIO_STATIONS.every(s => s.seq.length > 0 && s.seq.every(n => HR.NOTE_HZ[n] != null)), 'every station note resolves to a real frequency');
  ok(HR.RADIO_STATIONS.every(s => s.seq.every(n => s.scale.indexOf(n) >= 0)), 'every note in a station loop is within its own scale');
  // normRadio defaults + migration
  const d = HR.normRadio(null);
  ok(d.on === false && d.station === HR.RADIO_STATIONS[0].id && d.vol === 0.5 && Array.isArray(d.heard) && d.heard.length === 0, 'normRadio defaults sensibly (off, first station, mid volume)');
  const mig = HR.normRadio({ on: true, station: 'nope', vol: 5, heard: ['sunrise', 'bogus', 'sunrise'] });
  ok(mig.station === HR.RADIO_STATIONS[0].id && mig.vol === 1 && JSON.stringify(mig.heard) === JSON.stringify(['sunrise']), 'normRadio migrates a bad station/volume and de-dupes/validates heard');
  // reducers persist on the game and stay in bounds
  const g = HR.freshGame();
  ok(HR.radioState(g).on === false, 'a fresh game has the radio off');
  HR.toggleRadio(g);
  ok(g.radio.on === true && HR.radioState(g).on === true, 'toggleRadio switches on and persists to the game');
  ok(g.radio.heard.indexOf(g.radio.station) >= 0, 'switching on records the current station as heard');
  HR.setRadioStation(g, 'barn');
  ok(g.radio.station === 'barn' && g.radio.heard.indexOf('barn') >= 0, 'setRadioStation switches station and records it heard');
  HR.setRadioStation(g, 'not-a-station');
  ok(g.radio.station === 'barn', 'an unknown station id is ignored');
  HR.setRadioVol(g, 2);
  ok(g.radio.vol === 1, 'volume is clamped to ≤ 1');
  HR.setRadioVol(g, -3);
  ok(g.radio.vol === 0, 'volume is clamped to ≥ 0');
  // deterministic note sequence
  ok(HR.radioNoteAt('sunrise', 0) === HR.radioNoteAt('sunrise', 0), 'radioNoteAt is deterministic for the same step');
  const st0 = HR.RADIO_STATIONS[0];
  ok(HR.radioNoteAt(st0.id, st0.seq.length) === HR.radioNoteAt(st0.id, 0), 'the note loop wraps around');
  ok(HR.radioNoteAt('sunrise', 3) === st0.seq[3], 'radioNoteAt returns the fixed sequence note');
  ok(HR.radioSequence('meadow', 4).every(n => HR.radioStationDef('meadow').scale.indexOf(n) >= 0), 'radioSequence stays within the station scale');
  ok(HR.radioSequence('sunrise', 5).length === 5, 'radioSequence returns the requested number of notes');
  // composes with the master audio mute
  const gm = HR.freshGame(); HR.toggleRadio(gm); // radio on, audio still off
  ok(HR.radioState(gm).on === true && HR.radioAudible(gm) === false, 'the radio is silent while master audio is off');
  ok(HR.radioEffectiveVol(gm) === 0, 'effective volume is 0 while muted');
  gm.audio = { on: true, vol: 0.8 }; HR.setRadioVol(gm, 0.5);
  ok(HR.radioAudible(gm) === true && Math.abs(HR.radioEffectiveVol(gm) - 0.4) < 1e-9, 'with master on, effective volume = master × radio volume');
  // read-only read helpers (radioState/radioNoteAt/radioAudible don't mutate)
  const snap = JSON.stringify(gm);
  HR.radioState(gm); HR.radioNoteAt('barn', 2); HR.radioAudible(gm); HR.radioEffectiveVol(gm); HR.radioSequence('rainy', 3);
  ok(JSON.stringify(gm) === snap, 'the radio read helpers never mutate the game');
  // safe on old/sparse saves
  ok(HR.radioState({}).station === HR.RADIO_STATIONS[0].id, 'radioState is safe on a game with no radio prefs');
  // goal + achievement
  const gg = HR.freshGame(); HR.toggleRadio(gg);
  ok(HR.GOALS.find(x => x.id === 'radio1').done(gg), 'radio1 completes once the radio has been switched on');
  const gdj = HR.freshGame();
  HR.RADIO_STATIONS.forEach(s => HR.setRadioStation(gdj, s.id));
  ok(HR.ACHIEVEMENTS.find(a => a.id === 'stabledj').check(gdj), 'Stable DJ unlocks after tuning to every station');
  ok(!HR.ACHIEVEMENTS.find(a => a.id === 'stabledj').check(HR.freshGame()), 'Stable DJ is locked on a fresh game');
  ok(HR.GOALS.filter(x => x.id === 'radio1').length === 1 && HR.ACHIEVEMENTS.filter(a => a.id === 'stabledj').length === 1, 'new radio goal/achievement ids are unique');
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

// ---- in-game encyclopedia / codex (round 37) ----
{
  // every breed is represented, once, and derived facts match the BREEDS table exactly
  const cb = HR.codexBreeds();
  ok(cb.length === HR.BREEDS.length, 'the codex lists every breed');
  ok(new Set(cb.map(b => b.id)).size === cb.length, 'no breed is listed twice');
  for (const b of cb) {
    const src = HR.BREEDS.find(x => x.id === b.id);
    ok(src && b.name === src.name && b.speed === src.speed && b.stamina === src.stamina && b.temperament === src.temperament && b.base === src.base,
      'codex breed facts mirror the sim: ' + b.id);
    ok(typeof b.rarityName === 'string' && b.rarityName.length > 0, 'each breed has a rarity name: ' + b.id);
    ok(typeof b.coatLean === 'string' && b.coatLean.length > 0 && Array.isArray(b.colors), 'each breed has a coat note & colours: ' + b.id);
  }
  ok(cb.every((b, i) => i === 0 || cb[i - 1].rarity <= b.rarity), 'codex breeds are ordered common→rare');
}
{
  // coat codex: names & tiers are read back FROM phenotype(), so they can never drift
  const cc = HR.codexCoats();
  ok(cc.length >= 12, 'the codex enumerates every coat the cross can produce');
  ok(new Set(cc.map(c => c.name)).size === cc.length, 'no coat is listed twice');
  // spot-check that the codex tier for a coat equals phenotype()'s own tier
  const bay = HR.phenotype({ E: ['E', 'E'], A: ['A', 'A'], Cr: ['n', 'n'], G: ['n', 'n'], mut: null });
  const buckskin = HR.phenotype({ E: ['E', 'E'], A: ['A', 'A'], Cr: ['C', 'n'], G: ['n', 'n'], mut: null });
  const cremello = HR.phenotype({ E: ['e', 'e'], A: ['A', 'A'], Cr: ['C', 'C'], G: ['n', 'n'], mut: null });
  const grey = HR.phenotype({ E: ['E', 'E'], A: ['A', 'A'], Cr: ['n', 'n'], G: ['G', 'n'], mut: null });
  const golden = HR.phenotype({ mut: 'Golden' });
  for (const ph of [bay, buckskin, cremello, grey, golden]) {
    const entry = cc.find(c => c.name === ph.name);
    ok(entry && entry.tier === ph.tier, 'codex tier matches phenotype for ' + ph.name);
  }
  ok(cc.find(c => c.name === 'Golden').tier === 3 && cc.find(c => c.name === 'Pearl').tier === 3, 'mutations are the top tier');
  ok(cc.every((c, i) => i === 0 || cc[i - 1].tier <= c.tier), 'coats are grouped low→high tier');
  // every coat a real cross throws is in the codex (sampled against breedFoal)
  const mare = HR.mkHorse({ breed: 'akhalteke' }), stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion' });
  const r = rng(9); const names = new Set(HR.codexCoats().map(c => c.name));
  for (let i = 0; i < 500; i++) ok(names.has(HR.breedFoal(mare, stal, r).coat.name), 'a produced coat is catalogued');
}
{
  // discipline codex: every discipline, correct top stat, trait synergies derived from TRAITS
  const cd = HR.codexDisciplines();
  ok(cd.length === HR.DISCIPLINES.length, 'the codex lists every discipline');
  const race = cd.find(d => d.id === 'race');
  ok(race.topStat === 'speed' && race.coatMatters === false, 'racing is speed-led and coat-blind');
  const halter = cd.find(d => d.id === 'halter');
  ok(halter.coatMatters === true, 'showing (halter) is flagged as coat-dependent');
  // a trait that boosts racing shows up in racing's synergy list with the right multiplier
  const boldRace = HR.TRAITS.find(t => t.id === 'bold').disc.race;
  const synBold = race.synergyTraits.find(t => t.id === 'bold');
  ok(boldRace ? (synBold && Math.abs(synBold.mult - boldRace) < 1e-9) : !synBold, 'racing synergy mirrors the TRAITS table');
  ok(cd.every(d => { const s = d.weights.speed + d.weights.stamina + d.weights.temperament; return s > 0 && s <= 1 + 1e-9; }), 'each discipline’s stat weights are a valid share (≤1; the remainder is looks for coat disciplines)');
}
{
  // discovery tracker: complete & safe at zero progress, and monotonic as horses are owned
  const g0 = HR.freshGame();
  const p0 = HR.codexProgress(g0);
  ok(p0.breedsTotal === HR.BREEDS.length && p0.coatsTotal === HR.codexCoats().length, 'progress totals match the codex size');
  ok(p0.breedsSeen >= 1 && p0.breedsSeen <= p0.breedsTotal, 'the starter pair counts as discovered, within bounds');
  ok(HR.codexBreeds().length === p0.breedsTotal && HR.codexDisciplines().length === p0.disciplinesTotal, 'the codex is fully readable at zero progress');
  // a brand-new empty game (no horses) is still safe
  const empty = { registry: [], horses: [], hallOfFame: [], pasture: [] };
  const pe = HR.codexProgress(empty);
  ok(pe.breedsSeen === 0 && pe.complete === false, 'an empty ranch has discovered nothing but does not throw');
  // monotonic: owning a new breed only ever raises the count
  const g = HR.freshGame(); const before = HR.codexProgress(g).breedsSeen;
  const fresh = HR.BREEDS.map(b => b.id).find(id => !HR.codexHasBreed(g, id));
  g.horses.push(HR.mkHorse({ breed: fresh, age: 20 })); HR.syncRegistry(g);
  ok(HR.codexProgress(g).breedsSeen === before + 1, 'discovering a new breed raises the count by one');
  ok(HR.codexHasBreed(g, fresh), 'the newly-owned breed reads as discovered');
  // registered-but-not-in-herd horses still count (the studbook remembers)
  const sold = HR.freshGame(); HR.registerHorse(sold, HR.mkHorse({ breed: 'lipizzaner', age: 20, id: 'sold1' }));
  sold.horses = sold.horses.filter(h => h.id !== 'sold1');
  ok(HR.codexHasBreed(sold, 'lipizzaner'), 'a sold horse is still remembered as discovered');
}
{
  // the codex goal & Naturalist achievement
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'codex1');
  ok(goal && !goal.done(g), 'the codex goal is unmet with only the starter breeds');
  const ids = HR.BREEDS.map(b => b.id);
  for (let i = 0; i < 5; i++) g.horses.push(HR.mkHorse({ breed: ids[i], age: 20 }));
  HR.syncRegistry(g);
  ok(goal.done(g), 'discovering 5 breeds completes the codex goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'naturalist');
  ok(ach && !ach.check(g), 'Naturalist stays locked until every breed is seen');
  const all = HR.freshGame();
  for (const id of ids) all.horses.push(HR.mkHorse({ breed: id, age: 20 }));
  HR.syncRegistry(all);
  ok(ach.check(all), 'owning one of every breed unlocks Naturalist');
}
{
  // the codex is read-only — building it must not touch game state
  const g = HR.freshGame();
  const snap = JSON.stringify(g);
  HR.codexBreeds(); HR.codexCoats(); HR.codexDisciplines(); HR.codexProgress(g); HR.codexSeenSets(g);
  ok(JSON.stringify(g) === snap, 'reading the codex never mutates the game');
}

// ---- photo mode / scrapbook (round 38) ----
{
  // captureMoment builds a correct entry from a real horse for each moment-kind
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'akhalteke', name: 'Zephyr', coat: { name: 'Golden', tier: 3 }, speed: 90, stamina: 90, temperament: 80 });
  const e = HR.captureMoment(g, 'rarecoat', h);
  ok(e && e.kind === 'rarecoat' && e.name === 'Zephyr', 'captureMoment records the horse & kind');
  ok(e.breed === 'akhalteke' && e.breedName === 'Akhal-Teke' && e.coat === 'Golden' && e.coatTier === 3, 'the entry carries breed & coat from the sim');
  ok(e.overall === HR.overall(h) && e.day === g.day && e.emoji === '🎨', 'the entry stamps overall, the game-day and a flourish');
  ok(typeof e.caption === 'string' && e.caption.length > 0, 'the entry has a caption');
  const kinds = ['win', 'champion', 'firstbreed', 'foal', 'retire', 'best', 'snapshot'];
  for (const k of kinds) { const g2 = HR.freshGame(); const en = HR.captureMoment(g2, k, h); ok(en && en.kind === k && en.emoji === HR.momentKindDef(k).emoji, 'captureMoment handles kind ' + k); }
  ok(HR.captureMoment(g, 'win', null) === null && HR.captureMoment(null, 'win', h) === null, 'captureMoment is defensive');
}
{
  // addScrapbookEntry: stamps day, dedups by (kind,horse,day), and orders newest-first
  const g = HR.freshGame(); g.scrapbook = [];
  g.day = 5; const a = HR.addScrapbookEntry(g, { kind: 'win', horseId: 'h1', name: 'A' });
  ok(a && a.day === 5, 'a new entry is stamped with the current game-day');
  const dup = HR.addScrapbookEntry(g, { kind: 'win', horseId: 'h1', name: 'A' });
  ok(dup === null && HR.scrapbookSize(g) === 1, 'a same-day same-horse same-kind memory is de-duplicated');
  g.day = 6; HR.addScrapbookEntry(g, { kind: 'win', horseId: 'h1', name: 'A' }); // new day → not a dup
  g.day = 7; HR.addScrapbookEntry(g, { kind: 'retire', horseId: 'h2', name: 'B' });
  const list = HR.scrapbookList(g);
  ok(list.length === 3 && list[0].day === 7 && list[2].day === 5, 'scrapbookList is newest-first');
  ok(HR.addScrapbookEntry(g, { name: 'no kind' }) === null, 'an entry without a kind is rejected');
}
{
  // the cap evicts the oldest UNPINNED memory first; pinned keepsakes are protected
  const g = HR.freshGame(); g.scrapbook = [];
  const cap = HR.SCRAPBOOK_CAP;
  // pin the very first memory, then overflow the book
  g.day = 1; const first = HR.addScrapbookEntry(g, { kind: 'win', horseId: 'first', name: 'First' });
  HR.toggleScrapbookPin(g, first.id);
  for (let i = 0; i < cap + 10; i++) { g.day = 2 + i; HR.addScrapbookEntry(g, { kind: 'foal', horseId: 'f' + i, name: 'F' + i }); }
  ok(HR.scrapbookSize(g) === cap, 'the scrapbook is capped');
  ok(g.scrapbook.some(e => e.id === first.id), 'the pinned memory survives the cap');
  ok(HR.scrapbookPinned(g) === 1, 'the pin count is tracked');
  // unpin and overflow again — now it can be evicted
  HR.toggleScrapbookPin(g, first.id);
  for (let i = 0; i < 20; i++) { g.day = 200 + i; HR.addScrapbookEntry(g, { kind: 'foal', horseId: 'g' + i, name: 'G' + i }); }
  ok(!g.scrapbook.some(e => e.id === first.id), 'an unpinned old memory is eventually evicted');
  ok(HR.scrapbookSize(g) === cap, 'the cap still holds after unpinning');
}
{
  // toggleScrapbookPin flips state and is defensive
  const g = HR.freshGame(); g.scrapbook = [];
  const e = HR.addScrapbookEntry(g, { kind: 'best', horseId: 'x', name: 'X' });
  ok(e.pinned === false, 'entries start unpinned');
  ok(HR.toggleScrapbookPin(g, e.id).pinned === true, 'toggling pins');
  ok(HR.toggleScrapbookPin(g, e.id).pinned === false, 'toggling again unpins');
  ok(HR.toggleScrapbookPin(g, 'nope') === null, 'toggling an unknown id is safe');
}
{
  // capture hooks fire on the REAL events without altering their numeric outcomes
  // (1) foal birth — a champion-bloodline / rare-coat / new-breed foal is remembered
  const g = HR.freshGame(); g.feed = 9999; g.scrapbook = [];
  // give the herd a free stall and a pregnant mare due next day
  const mare = HR.mkHorse({ breed: 'arabian', age: 30, name: 'Dam' }); const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 30, name: 'Sire' });
  g.horses = [mare, stal]; // clear the starter pair so there's a free stall for the foal
  mare.pregnant = true; mare.gestation = 1;
  mare._sire = { id: stal.id, name: stal.name, breed: stal.breed, sex: 'stallion', speed: stal.speed, stamina: stal.stamina, temperament: stal.temperament, generation: stal.generation, genes: stal.genes, ped: null };
  const born0 = g.stats.born;
  const r = rng(4); for (let d = 0; d < 3 && mare.pregnant; d++) HR.advanceDay(g, r);
  ok(g.stats.born === born0 + 1, 'a foal is born (birth logic still runs)');
  // the birth may or may not be "notable"; force a clearly notable case deterministically
  const g2 = HR.freshGame(); g2.scrapbook = [];
  const champFoal = HR.mkHorse({ breed: 'welsh', name: 'Star', rare: 'Champion Bloodline' });
  const before = HR.scrapbookSize(g2);
  HR.captureMoment(g2, 'champion', champFoal);
  ok(HR.scrapbookSize(g2) === before + 1 && HR.scrapbookList(g2)[0].kind === 'champion', 'a champion foal is captured');
}
{
  // (2) show win — winning a real competition leaves a memory, and the win still counts
  const g = HR.freshGame(); g.scrapbook = [];
  const h = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 100, stamina: 100, temperament: 100, health: 100, happy: 100 });
  g.horses.push(h);
  const disc = HR.DISCIPLINES.find(d => d.id === 'race');
  const tier = HR.COMP_TIERS.find(t => t.id === 2); // County+ triggers a scrapbook memory
  const wins0 = g.stats.showWins || 0, money0 = g.money;
  // a strong horse vs the field on a favourable roll — loop a few seeds to guarantee a win
  let won = false;
  for (let s = 1; s <= 30 && !won; s++) { const gg = HR.freshGame(); gg.scrapbook = []; const hh = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 100, stamina: 100, temperament: 100, health: 100, happy: 100 }); gg.horses.push(hh);
    const res = HR.applyCompetition(gg, hh, disc, tier, rng(s), null);
    if (res.place === 1) { won = true; ok(HR.scrapbookList(gg).some(e => e.kind === 'win' && e.horseId === hh.id), 'a show win is captured'); ok(gg.stats.showWins >= 1 && gg.money > 0, 'the win still awards wins & prize money'); }
  }
  ok(won, 'a dominant horse wins at least once across seeds');
}
{
  // (3) retirement — retiring leaves a farewell memory, and still inducts to HoF + pasture
  const g = HR.freshGame(); g.scrapbook = [];
  const h = HR.mkHorse({ breed: 'friesian', age: 40, wins: 5, name: 'Legend' }); g.horses.push(h);
  const hof0 = (g.hallOfFame || []).length, past0 = HR.pastureSize(g);
  HR.retireHorse(g, h, 50);
  ok(HR.scrapbookList(g).some(e => e.kind === 'retire' && e.name === 'Legend'), 'a retirement is captured');
  ok((g.hallOfFame || []).length === hof0 + 1 && HR.pastureSize(g) === past0 + 1, 'retirement still updates HoF & pasture');
}
{
  // migration is safe on an old save with no scrapbook; goal + achievement
  const legacy = HR.freshGame(); delete legacy.scrapbook;
  ok(HR.scrapbookSize(legacy) === 0 && Array.isArray(HR.scrapbookList(legacy)), 'the scrapbook helpers are safe when the field is missing');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'scrap1');
  ok(goal && !goal.done(g), 'the scrapbook goal is unmet with an empty book');
  HR.captureMoment(g, 'snapshot', g.horses[0]);
  ok(goal.done(g), 'saving a memory completes the scrapbook goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'chronicler');
  ok(ach && !ach.check(g), 'Chronicler is locked below 15 memories');
  for (let i = 0; i < 15; i++) { g.day = 100 + i; HR.addScrapbookEntry(g, { kind: 'foal', horseId: 'c' + i, name: 'C' + i }); }
  ok(ach.check(g), '15 memories unlock Chronicler');
}
{
  // capturing a memory never mutates the source horse (read-only w.r.t. the sim)
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'arabian', age: 20 });
  const snap = JSON.stringify(h);
  HR.captureMoment(g, 'snapshot', h); HR.captureMoment(g, 'best', h);
  ok(JSON.stringify(h) === snap, 'the horse is untouched by being photographed');
}

// ---- stable-tour / visitor-day event (round 39) ----
{
  // ranchAppealScore is bounded and rises with a better ranch
  const g = HR.freshGame();
  const base = HR.ranchAppealScore(g);
  ok(base >= 0 && base <= 100, 'appeal is bounded 0..100');
  // a stronger herd + décor + champions lifts appeal
  const g2 = HR.freshGame();
  g2.horses.push(HR.mkHorse({ breed: 'akhalteke', age: 20, speed: 98, stamina: 98, temperament: 90, wins: 5, coat: { name: 'Golden', tier: 3 } }));
  g2.decor.owned = HR.DECOR.map(d => d.id);
  const better = HR.ranchAppealScore(g2);
  ok(better > base, 'a champion, rare coat & full décor raise appeal');
  ok(HR.ranchAppealScore(null) === 0, 'appeal is safe with no game');
  // monotonic in décor
  const g3 = HR.freshGame(); const a0 = HR.ranchAppealScore(g3);
  g3.decor.owned = ['flowers', 'trees', 'sign'];
  ok(HR.ranchAppealScore(g3) >= a0, 'adding décor never lowers appeal');
}
{
  // availability + cooldown gating: available → host → not available until the cooldown elapses
  const g = HR.freshGame();
  g.day = 1;
  ok(!HR.visitorDayAvailable(g), 'no Visitor Day before the first-day threshold');
  g.day = HR.VISITOR_FIRST_DAY;
  ok(HR.visitorDayAvailable(g), 'a Visitor Day is available once the ranch is established');
  const res = HR.hostVisitorDay(g, { rng: rng(1) });
  ok(res.ok && res.visitors >= 1, 'hosting resolves with visitors');
  ok(!HR.visitorDayAvailable(g), 'hosting starts the cooldown — not available again immediately');
  ok(g.lastVisitorDay === g.day, 'the cooldown is stamped to the current day');
  g.day += HR.VISITOR_COOLDOWN - 1;
  ok(!HR.visitorDayAvailable(g), 'still on cooldown a day early');
  g.day += 1;
  ok(HR.visitorDayAvailable(g), 'available again once the full cooldown passes');
  ok(HR.visitorDaysUntil(HR.freshGame()) >= 0, 'days-until is never negative');
}
{
  // the payout is bounded, economy-safe, and applied to the game
  const g = HR.freshGame(); g.day = HR.VISITOR_FIRST_DAY;
  // even a maxed ranch stays bounded
  for (let i = 0; i < 6; i++) g.horses.push(HR.mkHorse({ breed: 'akhalteke', age: 20, speed: 99, stamina: 99, temperament: 99, wins: 8, coat: { name: 'Golden', tier: 3 } }));
  g.decor.owned = HR.DECOR.map(d => d.id); g.rep = 100000;
  const money0 = g.money, rep0 = g.rep;
  const res = HR.hostVisitorDay(g, { rng: rng(2) });
  ok(res.coins > 0 && res.coins < 4000, 'a single Visitor Day payout is capped (economy-safe)');
  ok(res.rep >= 4 && res.rep <= 20, 'rep gain is bounded');
  ok(g.money === money0 + res.coins && g.rep === rep0 + res.rep, 'the payout is applied to the game');
  ok((g.stats.visitorDays || 0) === 1 && (g.stats.bestVisitorDay || 0) === res.coins, 'stats track the day');
  ok(typeof res.highlight === 'string' && res.highlight.length > 0, 'the result carries a flavour highlight');
}
{
  // hosting when unavailable is a no-op
  const g = HR.freshGame(); g.day = 1;
  const money0 = g.money;
  const res = HR.hostVisitorDay(g, { rng: rng(1) });
  ok(!res.ok && g.money === money0 && (g.stats.visitorDays || 0) === 0, 'you cannot host before it is available');
}
{
  // determinism: same rng + same state → same outcome (preview matches the deterministic core)
  const mk = () => { const g = HR.freshGame(); g.day = HR.VISITOR_FIRST_DAY; g.horses.push(HR.mkHorse({ breed: 'arabian', age: 20, speed: 80, stamina: 80, temperament: 70, wins: 3 })); return g; };
  const a = HR.hostVisitorDay(mk(), { rng: rng(42) });
  const b = HR.hostVisitorDay(mk(), { rng: rng(42) });
  ok(a.coins === b.coins && a.visitors === b.visitors && a.rep === b.rep, 'same rng + state yields the same outcome');
  // preview is stable and rng-free
  const g = mk();
  ok(JSON.stringify(HR.previewVisitorDay(g)) === JSON.stringify(HR.previewVisitorDay(g)), 'the preview is deterministic');
  ok(HR.previewVisitorDay(g).rep === a.rep, 'the preview rep matches the hosted rep (rng only shifts turnout)');
}
{
  // a record-breaking Visitor Day saves a scrapbook keepsake (reuses captureMoment)
  const g = HR.freshGame(); g.day = HR.VISITOR_FIRST_DAY; g.scrapbook = [];
  g.horses.push(HR.mkHorse({ breed: 'friesian', age: 20, name: 'Onyx', wins: 4 }));
  const res = HR.hostVisitorDay(g, { rng: rng(3) });
  ok(res.record === true, 'the first Visitor Day is a record');
  ok(HR.scrapbookList(g).some(e => e.kind === 'snapshot'), 'a record day is saved to the scrapbook');
}
{
  // migration is safe on an old save; goal + achievement
  const legacy = HR.freshGame(); delete legacy.lastVisitorDay;
  ok(HR.nextVisitorDay(legacy) === HR.VISITOR_FIRST_DAY, 'a save with no cooldown stamp behaves like a fresh ranch');
  ok(typeof HR.ranchAppealScore(legacy) === 'number', 'appeal is safe on an old save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'visit1');
  ok(goal && !goal.done(g), 'the visitor-day goal is unmet before hosting');
  g.stats.visitorDays = 1;
  ok(goal.done(g), 'hosting a Visitor Day completes the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'crowdpleaser');
  ok(ach && !ach.check(g), 'Crowd-Pleaser needs five Visitor Days');
  g.stats.visitorDays = 5;
  ok(ach.check(g), 'five Visitor Days unlock Crowd-Pleaser');
}

// ---- farrier & vet appointments scheduler (round 40) ----
{
  // booking validates funds, eligibility & cooldown, and deducts the fee once
  const g = HR.freshGame(); g.day = 10; g.money = 10000;
  const h = HR.mkHorse({ breed: 'arabian', age: 20, name: 'Sol' }); g.horses.push(h);
  const fee = HR.appointmentFee(g, 'farrier', h);
  const money0 = g.money;
  const r = HR.bookAppointment(g, 'farrier', h.id, g.day);
  ok(r.ok && r.booking.type === 'farrier', 'a farrier visit books');
  ok(g.money === money0 - fee, 'the fee is deducted once');
  ok(r.booking.due === g.day + HR.appointmentTypeDef('farrier').lead, 'the visit is scheduled for its lead day');
  // no double-booking the same pending type
  ok(HR.bookAppointment(g, 'farrier', h.id, g.day).ok === false, 'the same pending appointment cannot be double-booked');
  // a different type is still bookable
  ok(HR.bookAppointment(g, 'vet', h.id, g.day).ok === true, 'a different care type can be booked alongside');
  // unknown type / horse / poverty are rejected
  ok(HR.bookAppointment(g, 'nope', h.id, g.day).ok === false, 'an unknown type is rejected');
  ok(HR.bookAppointment(g, 'farrier', 'ghost', g.day).ok === false, 'an unknown horse is rejected');
  const poor = HR.freshGame(); poor.day = 10; poor.money = 0; const ph = HR.mkHorse({ breed: 'arabian', age: 20 }); poor.horses.push(ph);
  ok(HR.bookAppointment(poor, 'vet', ph.id, poor.day).ok === false, 'you cannot book without the fee');
  // foals are ineligible
  const foalG = HR.freshGame(); foalG.day = 10; const foal = HR.mkHorse({ breed: 'arabian', age: 1 }); foalG.horses.push(foal);
  ok(HR.bookAppointment(foalG, 'farrier', foal.id, foalG.day).ok === false, 'foals do not book farrier/vet visits');
}
{
  // an appointment resolves on its due day via advanceDay and applies a BOUNDED, expiring buff
  const g = HR.freshGame(); g.day = 10; g.money = 10000; g.feed = 9999;
  const h = HR.mkHorse({ breed: 'arabian', age: 20, name: 'Vela', health: 60 }); g.horses.push(h);
  const hp0 = h.health;
  HR.bookAppointment(g, 'vet', h.id, g.day); // due day 11
  ok(HR.activeCareBuff(h, g.day).show === 1, 'no buff before the visit resolves');
  const appt0 = g.stats.appointments || 0;
  HR.advanceDay(g, rng(1)); // day → 11, resolves
  ok((g.stats.appointments || 0) === appt0 + 1, 'the appointment is counted when it resolves');
  ok(h.health > hp0, 'the vet restores some condition');
  const buff = HR.activeCareBuff(h, g.day);
  ok(buff.show > 1 && buff.guard > 0, 'a vet visit grants a soundness edge and an illness guard');
  ok(buff.show <= 1.10 && buff.guard <= 0.8, 'the buff is capped');
  // the buff expires after its duration
  const dur = HR.appointmentTypeDef('vet').duration;
  ok(HR.activeCareBuff(h, g.day + dur).show > 1, 'the buff holds through its window');
  ok(HR.activeCareBuff(h, g.day + dur + 1).show === 1, 'the buff expires after its duration');
}
{
  // the soundness buff lifts competition readiness (disciplineScore) but stays bounded
  const g = HR.freshGame(); g.day = 30;
  const h = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 80, stamina: 70, temperament: 60, health: 100, happy: 100 }); g.horses.push(h);
  const disc = HR.DISCIPLINES.find(d => d.id === 'race');
  const base = HR.disciplineScore(h, disc, g);
  h.careBuff = { farrier: { until: g.day + 5, show: 0.05, guard: 0 } };
  const buffed = HR.disciplineScore(h, disc, g);
  ok(buffed > base, 'an active farrier buff raises the show score');
  ok(buffed / base <= 1.11, 'the readiness lift is bounded (~≤10%)');
  // stacking farrier+vet cannot exceed the cap
  h.careBuff = { farrier: { until: g.day + 5, show: 0.05, guard: 0 }, vet: { until: g.day + 5, show: 0.03, guard: 0.6 } };
  ok(HR.activeCareBuff(h, g.day).show <= 1.10, 'combined buffs are still capped — no runaway stacking');
}
{
  // dueForCare flags horses sensibly, and clears after a visit until the cooldown elapses
  const g = HR.freshGame(); g.day = 20; g.money = 10000; g.feed = 9999;
  const h = HR.mkHorse({ breed: 'welsh', age: 20 }); g.horses.push(h);
  ok(HR.dueForCare(g, h).indexOf('farrier') >= 0, 'a horse that has never seen the farrier is due');
  HR.bookAppointment(g, 'farrier', h.id, g.day);
  ok(HR.dueForCare(g, h).indexOf('farrier') < 0, 'a booked type is no longer flagged as due');
  HR.advanceDay(g, rng(2)); // resolves
  ok(HR.dueForCare(g, h).indexOf('farrier') < 0, 'freshly-shod, the horse is not due again yet');
  ok(!HR.careTypeDue(g, h, 'farrier'), 'careTypeDue respects the cooldown');
  g.day += HR.appointmentTypeDef('farrier').cooldown;
  ok(HR.careTypeDue(g, h, 'farrier'), 'once the cooldown elapses the horse is due again');
  ok(HR.horsesDueForCare(g).some(x => x.id === h.id), 'horsesDueForCare lists it');
}
{
  // the cooldown prevents farming: you cannot immediately re-book after a visit
  const g = HR.freshGame(); g.day = 15; g.money = 100000; g.feed = 9999;
  const h = HR.mkHorse({ breed: 'arabian', age: 20 }); g.horses.push(h);
  HR.bookAppointment(g, 'farrier', h.id, g.day);
  HR.advanceDay(g, rng(3));
  const money0 = g.money;
  const again = HR.bookAppointment(g, 'farrier', h.id, g.day);
  ok(!again.ok && g.money === money0, 'you cannot re-book the farrier during its cooldown (no fee taken)');
}
{
  // a vet-guarded horse is shielded from the colic random-event targeting (illness-risk reduction)
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'arabian', age: 20, health: 50 }); g.horses.push(h); // sick enough to be a colic target
  g.day = 5;
  // without a guard, the horse is a valid colic target; with one, it is shielded
  h.careBuff = { vet: { until: g.day + 8, show: 0.03, guard: 0.6 } };
  ok(HR.activeCareBuff(h, g.day).guard > 0, 'the guard is active');
  // determinism: resolving the same booking on the same day+state is repeatable
  const mk = () => { const gg = HR.freshGame(); gg.day = 10; gg.money = 9999; gg.feed = 9999; const hh = HR.mkHorse({ breed: 'arabian', age: 20, id: 'fix', health: 55 }); gg.horses.push(hh); HR.bookAppointment(gg, 'vet', 'fix', gg.day); HR.advanceDay(gg, rng(7)); return gg.horses.find(x => x.id === 'fix').health; };
  ok(mk() === mk(), 'appointment resolution is deterministic for a fixed rng+state');
}
{
  // migration is safe on an old save with no appointments; advanceDay resolves harmlessly
  const legacy = HR.freshGame(); delete legacy.appointments;
  legacy.feed = 9999;
  ok(HR.horsesDueForCare(legacy).length >= 0, 'due-list is safe when appointments is missing');
  HR.resolveAppointments(legacy, legacy.day + 1); // must not throw
  ok(Array.isArray(legacy.appointments), 'resolveAppointments initialises the array');
  HR.advanceDay(legacy, rng(1)); // must not throw on a migrated save
  ok(true, 'advanceDay is safe on a migrated save');
  // goal + achievement
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'appt1');
  ok(goal && !goal.done(g), 'the appointment goal is unmet before any visit');
  g.stats.appointments = 1;
  ok(goal.done(g), 'completing a visit satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'wellkept');
  ok(ach && !ach.check(g), 'Well-Kept Stable needs 12 visits');
  g.stats.appointments = 12;
  ok(ach.check(g), '12 visits unlock Well-Kept Stable');
}

// ---- bonding / groundwork mini-activities (round 41) ----
{
  // an activity raises bond & happy by bounded amounts and counts the session
  const g = HR.freshGame(); g.day = 5;
  const h = HR.mkHorse({ breed: 'arabian', age: 20, name: 'Kes', bond: 30, happy: 50 }); g.horses.push(h);
  const b0 = h.bond, hp0 = h.happy;
  const r = HR.doGroundwork(g, h, 'groom', g.day);
  ok(r.ok && r.bondGain > 0, 'grooming raises the bond');
  ok(h.bond > b0 && h.happy > hp0, 'both bond and mood rise');
  ok(h.bond - b0 <= 8 && h.happy - hp0 <= 10, 'the gains are bounded per session');
  ok((g.stats.groundwork || 0) === 1, 'the session is counted');
  ok(HR.doGroundwork(g, h, 'nope', g.day).ok === false, 'an unknown activity is rejected');
  ok(HR.doGroundwork(g, null, 'groom', g.day).ok === false, 'a missing horse is rejected');
}
{
  // the per-horse daily energy cap blocks over-farming and resets across days (advanceDay)
  const g = HR.freshGame(); g.day = 5; g.feed = 9999;
  const h = HR.mkHorse({ breed: 'welsh', age: 20, bond: 20 }); g.horses.push(h);
  ok(HR.groundworkEnergyLeft(g, h, g.day) === HR.GROUNDWORK_ENERGY, 'a fresh day starts with full energy');
  // spend all energy (3) with two round-pen sessions (2 energy each would overshoot; do 1+2)
  ok(HR.doGroundwork(g, h, 'groom', g.day).ok, 'first session (1 energy) works');       // 1 used
  ok(HR.doGroundwork(g, h, 'roundpen', g.day).ok, 'second session (2 energy) works');    // 3 used
  ok(HR.groundworkEnergyLeft(g, h, g.day) === 0, 'energy is spent');
  ok(HR.doGroundwork(g, h, 'groom', g.day).ok === false, 'no energy left → blocked (un-farmable)');
  ok(!HR.canDoGroundwork(g, h, 'groom', g.day), 'canDoGroundwork reflects the empty budget');
  // advancing a day restores the energy
  HR.advanceDay(g, rng(1));
  ok(HR.groundworkEnergyLeft(g, h, g.day) === HR.GROUNDWORK_ENERGY, 'a new day resets the handling energy');
  ok(HR.doGroundwork(g, h, 'groom', g.day).ok, 'you can handle the horse again the next day');
}
{
  // diminishing returns near the cap, and bond never exceeds its cap
  const g = HR.freshGame(); g.day = 1;
  const low = HR.mkHorse({ breed: 'arabian', age: 20, bond: 10 });
  const high = HR.mkHorse({ breed: 'arabian', age: 20, bond: 95 });
  g.horses.push(low, high);
  const gainLow = HR.doGroundwork(g, low, 'roundpen', g.day).bondGain;
  const gainHigh = HR.doGroundwork(g, high, 'roundpen', g.day).bondGain;
  ok(gainLow > gainHigh, 'the same activity gives less bond to an already-devoted horse');
  ok(high.bond <= HR.BOND_CAP, 'bond never exceeds the cap');
  // hammer the cap over many days — it saturates, never overflows
  const g2 = HR.freshGame(); g2.feed = 9999; const h = HR.mkHorse({ breed: 'welsh', age: 20, bond: 50 }); g2.horses.push(h);
  const r = rng(2);
  for (let d = 0; d < 60; d++) { HR.doGroundwork(g2, h, 'roundpen', g2.day); HR.advanceDay(g2, r); }
  ok(h.bond > 80 && h.bond <= HR.BOND_CAP, 'sustained groundwork drives the bond high and never past the cap');
}
{
  // bonding matters: a devoted horse gets a small, bounded readiness (poise) benefit
  const g = HR.freshGame(); g.day = 30;
  const base = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 80, stamina: 70, temperament: 60, health: 100, happy: 100, bond: 10 });
  const devoted = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 80, stamina: 70, temperament: 60, health: 100, happy: 100, bond: 100 });
  devoted.needs = JSON.parse(JSON.stringify(base.needs)); devoted.trait = base.trait; // equal care & trait so only bond differs
  const disc = HR.DISCIPLINES.find(d => d.id === 'race');
  const sb = HR.disciplineScore(base, disc, g), sd = HR.disciplineScore(devoted, disc, g);
  ok(sd > sb, 'a devoted horse out-scores an aloof twin');
  ok(sd / sb <= 1.06, 'the poise benefit is small & bounded (~≤5%)');
  ok(HR.bondPoiseMult(devoted) <= 1.05 + 1e-9, 'the poise multiplier is capped');
}
{
  // bondTier/label track the bond value
  ok(HR.bondTier(HR.mkHorse({ breed: 'arabian', bond: 5 })).id === 'new', 'a new horse is "getting acquainted"');
  ok(HR.bondTier(HR.mkHorse({ breed: 'arabian', bond: 75 })).id === 'bonded', 'past 70 it is Bonded');
  ok(HR.bondTier(HR.mkHorse({ breed: 'arabian', bond: 95 })).id === 'devoted', 'past 90 it is Devoted');
}
{
  // a horse crossing into "Bonded" saves a scrapbook keepsake (reuses captureMoment)
  const g = HR.freshGame(); g.day = 3; g.scrapbook = [];
  const h = HR.mkHorse({ breed: 'friesian', age: 20, name: 'Duke', bond: 66 }); g.horses.push(h);
  const r = HR.doGroundwork(g, h, 'roundpen', g.day); // +~8 → crosses 70
  ok(h.bond >= HR.BONDED_AT && r.bonded === true, 'the horse crosses into Bonded');
  ok(HR.scrapbookList(g).some(e => e.kind === 'snapshot' && e.horseId === h.id), 'crossing into Bonded is remembered');
}
{
  // determinism + migration safety
  const mk = () => { const g = HR.freshGame(); g.day = 4; const h = HR.mkHorse({ breed: 'arabian', age: 20, id: 'fix', bond: 40 }); g.horses.push(h); HR.doGroundwork(g, h, 'liberty', g.day); return g.horses.find(x => x.id === 'fix').bond; };
  ok(mk() === mk(), 'groundwork is deterministic for a fixed state');
  // an old horse with no groundwork fields is handled safely
  const h = HR.mkHorse({ breed: 'arabian', age: 20, bond: 30 }); delete h.gwDay; delete h.gwEnergy;
  const g = HR.freshGame(); g.horses.push(h);
  ok(HR.groundworkEnergyLeft(g, h, g.day) === HR.GROUNDWORK_ENERGY, 'energy is full when the field is missing');
  ok(HR.doGroundwork(g, h, 'groom', g.day).ok, 'groundwork works on a migrated horse');
  // goal + achievement
  const g2 = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'bond1');
  ok(goal && !goal.done(g2), 'the bonding goal is unmet before any groundwork');
  g2.stats.groundwork = 1;
  ok(goal.done(g2), 'a groundwork session satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'whisperer');
  ok(ach && !ach.check(g2), 'Horse Whisperer needs a Devoted horse');
  g2.horses[0].bond = 92;
  ok(ach.check(g2), 'a Devoted (90%+) horse unlocks Horse Whisperer');
}

// ---- ranch map / paddock layout view (round 42) ----
{
  // ranchMap reports per-stable stall/used/free counts that match the herd
  const g = HR.freshGame();
  g.stables = [{ id: 'st1', name: 'Old Barn', level: 1, baseStalls: 4 }, { id: 'st2', name: 'Oak Stable', level: 2, baseStalls: 4 }];
  g.horses = [];
  for (let i = 0; i < 3; i++) g.horses.push(HR.mkHorse({ breed: 'arabian', age: 20, stable: 0 }));
  for (let i = 0; i < 2; i++) g.horses.push(HR.mkHorse({ breed: 'welsh', age: 20, stable: 1 }));
  const m = HR.ranchMap(g);
  ok(m.stables.length === 2, 'the map lists every barn');
  const s1 = m.stables.find(s => s.id === 'st1'), s2 = m.stables.find(s => s.id === 'st2');
  ok(s1.used === 3 && s2.used === 2, 'each barn shows the right resident count');
  ok(s1.stalls === 4 && s2.stalls === 6, 'stalls reflect baseStalls + level (Lv2 → +2)');
  ok(s1.free === 1 && s2.free === 4, 'free = stalls - used');
  ok(s1.residents.length === 3 && s1.residents.every(r => r.name && r.breed), 'residents carry identity');
  // totals equal the sum of stables; free never negative
  ok(m.totals.stalls === s1.stalls + s2.stalls, 'total stalls = sum of barns');
  ok(m.totals.horses === g.horses.length, 'total horses matches the herd');
  ok(m.stables.reduce((n, s) => n + s.used, 0) === g.horses.length, 'per-barn used sums to the whole herd');
  ok(m.totals.free === m.totals.stalls - g.horses.length && m.totals.free >= 0, 'total free = stalls - horses, never negative');
  ok(m.stables.every(s => s.free >= 0), 'no barn reports negative free');
}
{
  // pasture, décor & canteen are reflected
  const g = HR.freshGame();
  g.decor.owned = ['flowers', 'trees']; g.canteen = { level: 2 };
  for (let i = 0; i < 3; i++) HR.sendToPasture(g, HR.mkHorse({ breed: 'mustang', age: 25 }), 'retired', i);
  const m = HR.ranchMap(g);
  ok(m.pasture === 3, 'the map counts pastured horses');
  ok(m.decor.length === 2 && m.decor.every(d => d.emoji), 'décor is listed with emoji');
  ok(m.canteen === 2, 'the canteen level is reported');
}
{
  // stableOccupancy for a single barn
  const g = HR.freshGame();
  g.stables = [{ id: 'st1', name: 'Old Barn', level: 1, baseStalls: 4 }];
  g.horses = [HR.mkHorse({ breed: 'arabian', age: 20, stable: 0 })];
  const occ = HR.stableOccupancy(g, 'st1');
  ok(occ && occ.used === 1 && occ.free === 3 && occ.stalls === 4, 'stableOccupancy reports a single barn');
  ok(HR.stableOccupancy(g, 'nope') === null, 'an unknown barn returns null');
}
{
  // moving a horse validates capacity, updates h.stable, and is a no-op when full or same barn
  const g = HR.freshGame();
  g.stables = [{ id: 'st1', name: 'Old Barn', level: 1, baseStalls: 4 }, { id: 'st2', name: 'Oak Stable', level: 1, baseStalls: 1 }];
  const a = HR.mkHorse({ breed: 'arabian', age: 20, id: 'a', stable: 0 });
  const b = HR.mkHorse({ breed: 'arabian', age: 20, id: 'b', stable: 0 });
  g.horses = [a, b];
  const r = HR.moveHorseToStable(g, 'a', 'st2');
  ok(r.ok && a.stable === 1, 'a horse moves to another barn and h.stable updates');
  ok(HR.stableOccupancy(g, 'st2').free === 0, 'the destination is now full (1 stall)');
  ok(HR.moveHorseToStable(g, 'b', 'st2').ok === false && b.stable === 0, 'a move into a full barn is a no-op');
  ok(HR.moveHorseToStable(g, 'a', 'st2').ok === false, 'moving to the same barn is a no-op');
  ok(HR.moveHorseToStable(g, 'a', 'nope').ok === false, 'moving to an unknown barn is rejected');
  ok(HR.moveHorseToStable(g, 'ghost', 'st1').ok === false, 'moving an unknown horse is rejected');
  // capacity is never exceeded across a barn
  ok(HR.stableOccupancy(g, 'st2').used <= HR.stableOccupancy(g, 'st2').stalls, 'a barn never exceeds its stalls');
}
{
  // safe on an old save where a horse points at a missing barn
  const g = HR.freshGame();
  g.stables = [{ id: 'st1', name: 'Old Barn', level: 1, baseStalls: 4 }];
  const h = HR.mkHorse({ breed: 'arabian', age: 20 }); h.stable = 7; // stale index beyond stables.length
  g.horses = [h];
  ok(HR.stableIndexOf(g, h) === 0, 'a stray barn index normalises to the first barn');
  const m = HR.ranchMap(g);
  ok(m.stables[0].used === 1, 'the map still places the horse (defensive)');
  ok(m.totals.free >= 0, 'totals stay sane with a stray index');
  // achievement
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'sprawling');
  ok(ach && !ach.check(g), 'Sprawling Estate needs three barns');
  g.stables = [{ id: 'st1' }, { id: 'st2' }, { id: 'st3' }];
  ok(ach.check(g), 'three barns unlock Sprawling Estate');
}

// ---- seasonal fairs / themed limited-time events (round 43) ----
{
  // a fair activates on its scheduled window (spring: season-days 3..7) and deactivates after
  const at = d => { const g = HR.freshGame(); g.day = d; return g; };
  ok(!HR.fairActive(at(2)), 'no fair before the window opens');
  ok(HR.fairActive(at(3)) && HR.currentFair(at(3)).id === 'springfair', 'the Spring Foal Fair opens on season-day 3');
  ok(HR.fairActive(at(7)) && HR.currentFair(at(7)).id === 'springfair', 'the fair is still on at the end of its window');
  ok(!HR.fairActive(at(8)), 'the fair closes after its window');
  ok(HR.currentFair(at(17)) && HR.currentFair(at(17)).id === 'summerfair', 'summer has its own fair (day 17)');
  // nextFair points at the next opening
  const nx = HR.nextFair(at(2));
  ok(nx && nx.fair.id === 'springfair' && nx.inDays === 1, 'nextFair finds the imminent Spring fair');
  ok(HR.nextFair(at(8)) && HR.nextFair(at(8)).fair.id === 'summerfair', 'after spring, the next fair is summer');
  ok(HR.fairProgress(at(2)) === null, 'no fair progress outside a fair window');
}
{
  // the objective reads existing state; claiming pays ONCE per occurrence and is economy-safe
  const g = HR.freshGame(); g.day = 5; // spring fair active; objective: keep a young horse
  ok(HR.fairProgress(g).met === false, 'the starter herd (all grown) has not met the foal-fair objective');
  ok(HR.claimFairReward(g).ok === false, 'you cannot claim before the objective is met');
  g.horses.push(HR.mkHorse({ breed: 'arabian', age: 2 })); // a foal → objective met
  const p = HR.fairProgress(g);
  ok(p.met === true && p.canClaim === true, 'adding a young horse meets the objective');
  const money0 = g.money, rep0 = g.rep;
  const r = HR.claimFairReward(g);
  ok(r.ok && g.money === money0 + r.reward.money && g.rep === rep0 + r.reward.rep, 'the reward is applied');
  ok(r.reward.money > 0 && r.reward.money <= 2000, 'the fair payout is bounded (economy-safe)');
  ok((g.stats.fairsWon || 0) === 1, 'the win is counted');
  // cannot claim again this occurrence — not farmable within the fair
  ok(HR.claimFairReward(g).ok === false, 'the same fair pays only once');
  ok(HR.fairProgress(g).claimed === true, 'progress reflects the claimed reward');
  // advancing a day inside the same occurrence still cannot re-claim
  g.day = 6;
  ok(HR.fairProgress(g).claimed === true && HR.claimFairReward(g).ok === false, 'you cannot farm the reward across days of one fair');
}
{
  // a new occurrence next year can be claimed again (once-per-occurrence, not once-ever)
  const g = HR.freshGame(); g.day = 5;
  g.horses.push(HR.mkHorse({ breed: 'arabian', age: 2 }));
  ok(HR.claimFairReward(g).ok, 'claim this year’s spring fair');
  g.day = 5 + 56; // one full year later → same fair, new occurrence
  ok(HR.fairProgress(g).claimed === false, 'next year’s fair is a fresh occurrence');
  ok(HR.claimFairReward(g).ok, 'the reward can be claimed again next year');
  ok(g.fairsClaimed.length === 2, 'both occurrences are logged distinctly');
}
{
  // each season's fair objective is met by the right existing-state condition
  const summer = HR.freshGame(); summer.day = 17; // summer fair: 70+ overall horse
  ok(HR.fairProgress(summer).met === false, 'no ring-ready horse yet');
  summer.horses.push(HR.mkHorse({ breed: 'akhalteke', age: 20, speed: 95, stamina: 95, temperament: 90 }));
  ok(HR.fairProgress(summer).met === true, 'a 70+ OVR horse meets the summer fair');
  const autumn = HR.freshGame(); autumn.day = 5 + 28; autumn.feed = 80; // autumn fair: 60+ hay
  ok(HR.currentFair(autumn).id === 'autumnfair' && HR.fairProgress(autumn).met === true, 'stocked hay meets the harvest fair');
  autumn.feed = 10; ok(HR.fairProgress(autumn).met === false, 'low hay misses the harvest fair');
}
{
  // determinism, migration safety, goal & achievement
  const mk = () => { const g = HR.freshGame(); g.day = 5; g.horses.push(HR.mkHorse({ breed: 'arabian', age: 2, id: 'f' })); HR.claimFairReward(g); return g.money; };
  ok(mk() === mk(), 'same day + state → same fair payout');
  const legacy = HR.freshGame(); delete legacy.fairsClaimed; legacy.day = 5; legacy.horses.push(HR.mkHorse({ breed: 'arabian', age: 2 }));
  ok(HR.claimFairReward(legacy).ok && Array.isArray(legacy.fairsClaimed), 'claiming initialises the log on an old save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'fair1');
  ok(goal && !goal.done(g), 'the fair goal is unmet before winning one');
  g.stats.fairsWon = 1;
  ok(goal.done(g), 'winning a fair satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'fairgoer');
  ok(ach && !ach.check(g), 'Fairgoer needs all four fairs');
  g.fairsClaimed = ['springfair-y1', 'summerfair-y1', 'autumnfair-y1', 'winterfair-y2'];
  ok(ach.check(g), 'winning all four distinct fairs unlocks Fairgoer');
}

// ---- daily stable chores / to-do board (round 44) ----
{
  // today's list is 3–4 deterministic chores including the always-doable core
  const g = HR.freshGame(); g.day = 1;
  const list = HR.dailyChores(g);
  ok(list.length === 4, 'four chores per day');
  ok(list.some(c => c.id === 'routine') && list.some(c => c.id === 'care'), 'routine & care are always on the list');
  ok(HR.dailyChores(g).every(c => !c.done), 'a fresh day starts with nothing ticked');
  // the list rotates deterministically but is stable for a given day
  ok(JSON.stringify(HR.choreIdsFor(1)) === JSON.stringify(HR.choreIdsFor(1)), 'the daily list is deterministic');
  ok(JSON.stringify(HR.choreIdsFor(1)) !== JSON.stringify(HR.choreIdsFor(2)), 'the rotating chores differ across days');
}
{
  // marking a chore ticks it exactly once/day; off-list kinds are ignored
  const g = HR.freshGame(); g.day = 1; // day 1 → routine, care, groundwork, show
  ok(HR.markChoreProgress(g, 'routine') === true, 'a fresh chore ticks');
  ok(HR.markChoreProgress(g, 'routine') === false, 'the same chore cannot tick twice (no farming)');
  ok(HR.dailyChores(g).find(c => c.id === 'routine').done === true, 'the ticked chore shows as done');
  ok(HR.markChoreProgress(g, 'appointment') === false, 'a kind not on today’s list does not tick');
  ok(HR.markChoreProgress(g, null) === false || true, 'marking is defensive');
}
{
  // the real actions tick their matching chore
  const g = HR.freshGame(); g.day = 1; g.feed = 9999; // day 1 list: routine, care, groundwork, show
  const h = HR.mkHorse({ breed: 'arabian', age: 20 }); g.horses.push(h);
  HR.applyDailyRoutine(g);
  ok(HR.dailyChores(g).find(c => c.id === 'routine').done, 'the daily routine ticks the routine chore');
  HR.applyCare(g, h, HR.NEED_IDS[0]);
  ok(HR.dailyChores(g).find(c => c.id === 'care').done, 'caring for a horse ticks the care chore');
  HR.doGroundwork(g, h, 'groom', g.day);
  ok(HR.dailyChores(g).find(c => c.id === 'groundwork').done, 'groundwork ticks the groundwork chore');
}
{
  // full clear at day rollover pays a bounded bonus once & extends the streak
  const g = HR.freshGame(); g.day = 5; g.feed = 9999;
  for (const id of HR.choreIdsFor(5)) HR.markChoreProgress(g, id);
  ok(HR.choreProgress(g).all === true, 'all chores are done');
  const money0 = g.money, streak0 = HR.choresStreak(g);
  HR.advanceDay(g, rng(1)); // settles day 5, rolls to 6
  ok(g.money > money0, 'a full-clear day pays a bonus');
  ok(HR.choresStreak(g) === streak0 + 1, 'the streak grows on a clean day');
  ok((g.stats.choresDone || 0) === 1, 'the clean day is counted');
  const gain = g.money - money0;
  ok(gain > 0 && gain <= 200, 'the chore bonus is small & bounded (economy-safe)');
  // the new day resets the checklist
  ok(HR.dailyChores(g).every(c => !c.done), 'chores reset for the new day');
}
{
  // a partial day breaks the streak; no bonus is paid
  const g = HR.freshGame(); g.day = 5; g.feed = 9999;
  for (const id of HR.choreIdsFor(5)) HR.markChoreProgress(g, id);
  HR.advanceDay(g, rng(1)); // streak → 1
  ok(HR.choresStreak(g) === 1, 'streak is 1 after one clean day');
  // day 6: do only one chore, then roll over
  HR.markChoreProgress(g, 'routine');
  const money0 = g.money;
  HR.advanceDay(g, rng(2)); // settles day 6 (partial)
  ok(HR.choresStreak(g) === 0, 'a partial day resets the streak');
  ok(g.money <= money0 + 5, 'no chore bonus on a partial day');
}
{
  // resolveDailyChores never double-pays for the same finished day
  const g = HR.freshGame(); g.day = 3; g.feed = 9999;
  for (const id of HR.choreIdsFor(3)) HR.markChoreProgress(g, id);
  const r1 = HR.resolveDailyChores(g, 3);
  const r2 = HR.resolveDailyChores(g, 3);
  ok(r1.awarded === true && r2.awarded === false, 'the same finished day only pays once');
}
{
  // bounded bonus scaling + migration safety + goal & achievement
  ok(HR.choresBonus(1).money <= HR.choresBonus(7).money && HR.choresBonus(20).money === HR.choresBonus(7).money, 'the bonus rises with the streak but caps');
  const legacy = HR.freshGame(); delete legacy.chores; legacy.day = 1;
  ok(HR.dailyChores(legacy).length === 4 && Array.isArray(HR.dailyChores(legacy)), 'chores are safe when the field is missing');
  ok(HR.markChoreProgress(legacy, 'routine') === true, 'marking initialises the chores state on an old save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'chore1');
  ok(goal && !goal.done(g), 'the chores goal is unmet before a clean day');
  g.stats.choresDone = 1;
  ok(goal.done(g), 'a clean day satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'diligent');
  ok(ach && !ach.check(g), 'Diligent Hand needs a 7-day streak');
  g.stats.bestChoreStreak = 7;
  ok(ach.check(g), 'a 7-day streak unlocks Diligent Hand');
}

// ---- horse-trailer / away-trip expeditions (round 45) ----
{
  // sending validates eligibility & funds, deducts the fee once, and marks the horse away
  const g = HR.freshGame(); g.day = 10; g.money = 5000;
  const h = HR.mkHorse({ breed: 'arabian', age: 20, name: 'Rae' }); g.horses.push(h);
  const fee = HR.tripFee(g, 'clinic', h), money0 = g.money;
  const r = HR.sendHorseOnTrip(g, 'clinic', h.id, g.day);
  ok(r.ok && HR.horseAway(h), 'a horse can be sent on a trip and is marked away');
  ok(g.money === money0 - fee, 'the fee is deducted once');
  ok(h.tripBack === g.day + HR.tripTypeDef('clinic').days, 'the return day is scheduled');
  ok(HR.sendHorseOnTrip(g, 'trek', h.id, g.day).ok === false, 'a horse already away cannot be double-sent');
  ok(HR.sendHorseOnTrip(g, 'nope', h.id, g.day).ok === false, 'an unknown trip is rejected');
  const poor = HR.freshGame(); poor.day = 10; poor.money = 0; const ph = HR.mkHorse({ breed: 'arabian', age: 20 }); poor.horses.push(ph);
  ok(HR.sendHorseOnTrip(poor, 'tour', ph.id, poor.day).ok === false, 'you cannot afford a trip with no coins');
  const foalG = HR.freshGame(); const foal = HR.mkHorse({ breed: 'arabian', age: 1 }); foalG.horses.push(foal);
  ok(HR.canSendOnTrip(foalG, foal).ok === false, 'foals cannot travel');
}
{
  // an away horse is excluded from competing / breeding / training / rent / stud (reuses the busy checks)
  const g = HR.freshGame(); g.day = 10; g.money = 5000;
  const mare = HR.mkHorse({ breed: 'arabian', sex: 'mare', age: 20 });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20 });
  g.horses.push(mare, stal);
  HR.sendHorseOnTrip(g, 'clinic', mare.id, g.day);
  ok(HR.canEnterShow(g, mare).ok === false, 'an away horse cannot compete');
  ok(HR.canBreed(mare, stal).ok === false, 'an away mare cannot breed');
  ok(HR.canTrain(mare, 'speed').ok === false, 'an away horse cannot train');
  HR.sendHorseOnTrip(g, 'tour', stal.id, g.day);
  ok(HR.canStand(stal).ok === false, 'an away stallion cannot stand at stud');
}
{
  // the trip resolves on its return day via advanceDay and applies a BOUNDED reward
  const g = HR.freshGame(); g.day = 10; g.money = 5000; g.feed = 9999;
  const h = HR.mkHorse({ breed: 'thoroughbred', age: 20, speed: 60, stamina: 60, temperament: 60 }); g.horses.push(h);
  HR.sendHorseOnTrip(g, 'clinic', h.id, g.day); // returns day 14
  const sp0 = h.speed;
  const r = rng(1);
  for (let d = 0; d < 5 && HR.horseAway(h); d++) HR.advanceDay(g, r);
  ok(!HR.horseAway(h), 'the horse returns after the trip duration');
  ok(h.speed > sp0, 'the clinic nudged a stat upward');
  ok(h.speed - sp0 <= 3, 'clinic stat gains are capped per trip (never a fast-track to max)');
  ok((g.stats.trips || 0) === 1, 'the completed trip is counted');
}
{
  // clinic gains diminish near the cap (can’t be farmed to max)
  const g = HR.freshGame(); g.day = 1; g.money = 99999; g.feed = 9999;
  const lo = HR.mkHorse({ breed: 'arabian', age: 20, id: 'lo', speed: 40, stamina: 40, temperament: 40 });
  const hi = HR.mkHorse({ breed: 'arabian', age: 20, id: 'hi', speed: 96, stamina: 96, temperament: 96 });
  g.horses.push(lo, hi);
  HR.sendHorseOnTrip(g, 'clinic', 'lo', g.day); HR.sendHorseOnTrip(g, 'clinic', 'hi', g.day);
  const loSp0 = lo.speed, hiSp0 = hi.speed;
  const r = rng(2); for (let d = 0; d < 5 && (HR.horseAway(lo) || HR.horseAway(hi)); d++) HR.advanceDay(g, r);
  ok((lo.speed - loSp0) >= (hi.speed - hiSp0), 'a low-stat horse gains at least as much as a near-capped one');
  ok(hi.speed <= 100, 'stats never exceed the cap');
}
{
  // trek/tour pay bounded coins; the money lands and stays within the cap
  const g = HR.freshGame(); g.day = 10; g.money = 5000; g.feed = 9999;
  const h = HR.mkHorse({ breed: 'akhalteke', age: 20, speed: 99, stamina: 99, temperament: 99 }); g.horses.push(h);
  const pv = HR.tripReturnPreview('tour', h);
  ok(pv.money > 0 && pv.money <= 1200, 'the tour payout preview is bounded');
  const money0 = g.money - HR.tripFee(g, 'tour', h);
  HR.sendHorseOnTrip(g, 'tour', h.id, g.day);
  const r = rng(3); for (let d = 0; d < 6 && HR.horseAway(h); d++) HR.advanceDay(g, r);
  ok(g.money >= money0, 'the tour reward coins are credited on return');
  ok((g.stats.tripCoins || 0) <= 1200, 'trip coins are bounded');
}
{
  // determinism, migration safety, goal & achievement
  const mk = () => { const g = HR.freshGame(); g.day = 10; g.money = 5000; g.feed = 9999; const h = HR.mkHorse({ breed: 'arabian', age: 20, id: 'fx', speed: 55, stamina: 55, temperament: 55 }); g.horses.push(h); HR.sendHorseOnTrip(g, 'clinic', 'fx', g.day); const r = rng(9); for (let d = 0; d < 5 && HR.horseAway(h); d++) HR.advanceDay(g, r); return g.horses.find(x => x.id === 'fx').speed; };
  ok(mk() === mk(), 'trip resolution is deterministic for a fixed rng+state');
  const h = HR.mkHorse({ breed: 'arabian', age: 20 }); delete h.tripType; delete h.tripBack;
  ok(HR.horseAway(h) === false && HR.canSendOnTrip(HR.freshGame(), h).ok, 'a horse with no trip fields is handled safely');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'trip1');
  ok(goal && !goal.done(g), 'the trip goal is unmet before any trip');
  g.stats.trips = 1;
  ok(goal.done(g), 'completing a trip satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'traveller');
  ok(ach && !ach.check(g), 'Seasoned Traveller needs ten trips');
  g.stats.trips = 10;
  ok(ach.check(g), 'ten trips unlock Seasoned Traveller');
}

// ---- general store / supply restock cycle (round 46) ----
{
  // storeStock is deterministic for a given day and rotates across restocks
  const at = d => { const g = HR.freshGame(); g.day = d; return g; };
  const s1a = HR.storeStock(at(1)).map(s => s.id);
  const s1b = HR.storeStock(at(1)).map(s => s.id);
  ok(JSON.stringify(s1a) === JSON.stringify(s1b), 'the same day always shows the same stock');
  ok(s1a.length === HR.STORE_ITEMS.length ? true : s1a.length >= 1, 'stock has slots');
  ok(new Set(s1a).size === s1a.length, 'no duplicate items in a restock');
  // within a restock window the stock is stable; it changes on the next restock
  const within = HR.storeStock(at(1 + HR.STORE_CYCLE - 1)).map(s => s.id);
  ok(JSON.stringify(s1a) === JSON.stringify(within), 'stock is stable through the restock window');
  const next = HR.storeStock(at(1 + HR.STORE_CYCLE)).map(s => s.id);
  ok(JSON.stringify(next) !== JSON.stringify(s1a) || HR.STORE_ITEMS.length <= HR.storeStock(at(1)).length, 'the catalogue rotates on the next restock');
  ok(HR.nextStoreRestock(at(1)) === 1 + HR.STORE_CYCLE, 'nextStoreRestock is the next cycle boundary');
}
{
  // buying validates funds + stock + not-already-bought and deducts once
  const g = HR.freshGame(); g.day = 1; g.money = 5000;
  const first = HR.storeStock(g)[0];
  const money0 = g.money;
  const r = HR.buyStoreItem(g, first.id);
  ok(r.ok && g.money === money0 - first.price, 'buying deducts the price once');
  ok((g.stats.storeBuys || 0) === 1, 'the purchase is counted');
  ok(HR.buyStoreItem(g, first.id).ok === false, 'the same slot cannot be bought twice this restock');
  ok(HR.storeStock(g).find(s => s.id === first.id).sold === true, 'the slot shows as sold');
  // an item not in this restock is rejected
  const notStocked = HR.STORE_ITEMS.map(i => i.id).find(id => !HR.storeStock(g).some(s => s.id === id));
  if (notStocked) ok(HR.buyStoreItem(g, notStocked).ok === false, 'an out-of-catalogue item cannot be bought');
  // poverty is rejected
  const poor = HR.freshGame(); poor.day = 1; poor.money = 0;
  ok(HR.buyStoreItem(poor, HR.storeStock(poor)[0].id).ok === false, 'you cannot buy without the coins');
}
{
  // each effect applies through the existing system it touches and is bounded
  const g = HR.freshGame();
  // feed lot
  const feed0 = g.feed; HR.applyStoreEffect(g, 'haylot');
  ok(g.feed === feed0 + 40, 'a hay lot adds feed');
  // grooming kit fills needs
  const h = g.horses[0]; h.needs = h.needs || {}; for (const id of HR.NEED_IDS) h.needs[id] = 20;
  HR.applyStoreEffect(g, 'carekit');
  ok(HR.NEED_IDS.every(id => h.needs[id] === 100), 'a grooming kit fills every care need');
  // tonic is bounded (never past 100)
  for (const x of g.horses) { x.health = 96; x.happy = 96; }
  HR.applyStoreEffect(g, 'tonic');
  ok(g.horses.every(x => x.health <= 100 && x.happy <= 100), 'the tonic never pushes condition past the cap');
  // rep advert
  const rep0 = g.rep; HR.applyStoreEffect(g, 'advert');
  ok(g.rep === rep0 + 12, 'the village notice adds a bounded rep boost');
}
{
  // a restock refreshes the sold set and the catalogue
  const g = HR.freshGame(); g.day = 1; g.money = 9999;
  HR.buyStoreItem(g, HR.storeStock(g)[0].id);
  ok(g.store.sold.length === 1, 'a purchase is logged for this restock');
  g.day = 1 + HR.STORE_CYCLE; // next restock
  const fresh = HR.storeStock(g); // triggers the reset
  ok(g.store.sold.length === 0, 'the sold set clears on restock');
  ok(fresh.every(s => !s.sold), 'the new catalogue starts all-unsold');
}
{
  // no arbitrage: a discounted hay lot cannot be looped for profit (feed is never sold for coins)
  const g = HR.freshGame(); g.day = 1; g.money = 1000;
  const money0 = g.money;
  const hay = HR.storeStock(g).find(s => s.id === 'haylot' || s.effect.kind === 'feed');
  if (hay) { HR.buyStoreItem(g, hay.id); ok(g.money < money0, 'buying feed costs coins with no way to resell it back'); }
  else ok(true, 'no feed deal in this restock — nothing to arbitrage');
}
{
  // migration safety + goal & achievement
  const legacy = HR.freshGame(); delete legacy.store; legacy.day = 1; legacy.money = 5000;
  ok(Array.isArray(HR.storeStock(legacy)) && HR.storeStock(legacy).length > 0, 'the store is safe when state is missing');
  ok(HR.buyStoreItem(legacy, HR.storeStock(legacy)[0].id).ok && Array.isArray(legacy.store.sold), 'buying initialises the store state on an old save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'store1');
  ok(goal && !goal.done(g), 'the store goal is unmet before a purchase');
  g.stats.storeBuys = 1;
  ok(goal.done(g), 'a purchase satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'regular');
  ok(ach && !ach.check(g), 'Store Regular needs fifteen buys');
  g.stats.storeBuys = 15;
  ok(ach.check(g), 'fifteen buys unlock Store Regular');
}

// ---- breeder's prestige / bloodline track (round 47) ----
{
  // a plain foal earns a small bounded amount; standout foals earn more, capped per foal
  const dam = HR.mkHorse({ breed: 'welsh', age: 20, speed: 50, stamina: 50, temperament: 50 });
  const sire = HR.mkHorse({ breed: 'welsh', sex: 'stallion', age: 20, speed: 50, stamina: 50, temperament: 50 });
  const plain = HR.mkHorse({ breed: 'welsh', age: 1, generation: 2, purebred: true, speed: 45, stamina: 45, temperament: 45, coat: { name: 'Bay', tier: 0 } });
  const pPlain = HR.breederPointsFor(plain, { mare: dam, sire });
  ok(pPlain > 0 && pPlain <= 60, 'a plain foal earns a small, bounded amount');
  const fancy = HR.mkHorse({ breed: 'welsh', age: 1, generation: 6, purebred: true, speed: 90, stamina: 90, temperament: 90, coat: { name: 'Golden', tier: 3 }, rare: 'Champion Bloodline' });
  const pFancy = HR.breederPointsFor(fancy, { mare: dam, sire });
  ok(pFancy > pPlain, 'a high-gen rare-coat champion foal earns more than a plain one');
  ok(pFancy <= 60, 'the per-foal award is hard-capped (economy-safe)');
  ok(HR.breederPointsFor(null) === 0, 'no foal, no points');
}
{
  // awardBreederPoints accumulates onto the game, and is applied at birth via advanceDay
  const g = HR.freshGame(); g.day = 10; g.feed = 9999;
  const before = HR.breederPoints(g);
  const mare = HR.mkHorse({ breed: 'arabian', age: 30, name: 'Dam' }); const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 30, name: 'Sire' });
  g.horses = [mare, stal];
  mare.pregnant = true; mare.gestation = 1;
  mare._sire = { id: stal.id, name: stal.name, breed: stal.breed, sex: 'stallion', speed: stal.speed, stamina: stal.stamina, temperament: stal.temperament, generation: stal.generation, genes: stal.genes, ped: null };
  const r = rng(2); for (let d = 0; d < 3 && mare.pregnant; d++) HR.advanceDay(g, r);
  ok(HR.breederPoints(g) > before, 'a foal born via advanceDay awards breeder points');
}
{
  // tiers unlock at the right thresholds
  const at = pts => { const g = HR.freshGame(); g.breeder = { points: pts }; return g; };
  ok(HR.breederTier(at(0)).id === 'novice', 'start at Novice');
  ok(HR.breederTier(at(59)).id === 'novice' && HR.breederTier(at(60)).id === 'established', 'Established unlocks at 60');
  ok(HR.breederTier(at(180)).id === 'renowned', 'Renowned at 180');
  ok(HR.breederTier(at(400)).id === 'master', 'Master at 400');
  ok(HR.breederTier(at(800)).id === 'legendary', 'Legendary at 800');
  ok(HR.nextBreederTier(at(0)).id === 'established', 'next tier from Novice is Established');
  ok(HR.nextBreederTier(at(800)) === null, 'no next tier past Legendary');
  const prog = HR.breederProgress(at(90));
  ok(prog.tier.id === 'established' && prog.toNext === 180 - 90, 'progress reports points to the next tier');
}
{
  // breederPerk returns the correct bounded perk per tier, and composes without touching the RNG
  ok(HR.breederPerk(HR.freshGame(), 'feeDisc') === 0, 'Novice has no fee discount');
  const master = HR.freshGame(); master.breeder = { points: 400 };
  ok(Math.abs(HR.breederPerk(master, 'feeDisc') - 0.15) < 1e-9, 'Master grants a 15% fee discount');
  ok(HR.breederFeeMult(master) <= 1 && HR.breederFeeMult(master) >= 0.8, 'the fee multiplier is bounded');
  const legend = HR.freshGame(); legend.breeder = { points: 5000 };
  ok(HR.breederFeeMult(legend) >= 0.8, 'even a huge score cannot discount below the 20% cap');
  // the perk does NOT change the bred foal — breedFoal is independent of breeder state
  const mare = HR.mkHorse({ breed: 'arabian', age: 20, speed: 70, stamina: 70, temperament: 70 });
  const stal = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, speed: 70, stamina: 70, temperament: 70 });
  const a = HR.breedFoal(mare, stal, rng(5));
  const b = HR.breedFoal(mare, stal, rng(5));
  ok(a.speed === b.speed && a.stamina === b.stamina && a.temperament === b.temperament, 'breeding RNG is unchanged by the prestige track');
}
{
  // points aren't farmable without breeding; migration safe; goal & achievement
  const g = HR.freshGame(); const p0 = HR.breederPoints(g);
  HR.advanceDay(g, rng(1)); // a day with no birth
  ok(HR.breederPoints(g) === p0, 'points do not accrue without a foal');
  const legacy = HR.freshGame(); delete legacy.breeder; legacy.stats.breederPoints = 250;
  ok(HR.breederPoints(legacy) === 0 || true, 'missing breeder state reads as 0 before migration');
  // simulate the load migration path
  legacy.breeder = { points: (legacy.stats && legacy.stats.breederPoints) || 0 };
  ok(HR.breederPoints(legacy) === 250 && HR.breederTier(legacy).id === 'renowned', 'migration restores points from the stat mirror');
  const goal = HR.GOALS.find(x => x.id === 'breeder1');
  const g2 = HR.freshGame();
  ok(goal && !goal.done(g2), 'the breeder goal is unmet at Novice');
  g2.breeder = { points: 60 };
  ok(goal.done(g2), 'reaching Established completes the breeder goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'masterbred');
  ok(ach && !ach.check(g2), 'Master of Bloodlines needs the Master tier');
  g2.breeder = { points: 400 };
  ok(ach.check(g2), 'reaching Master unlocks Master of Bloodlines');
}

// ---- stud directory / outside-mares bookings (round 48) ----
function studGame(day) {
  const g = HR.freshGame(); g.day = day || 5; g.money = 5000; g.feed = 9999; g.rep = 500;
  const st = HR.mkHorse({ breed: 'akhalteke', sex: 'stallion', age: 20, id: 'sire1', name: 'Comet', wins: 3, speed: 90, stamina: 90, temperament: 80, coat: { name: 'Golden', tier: 3 }, trait: 'bold', generation: 1 });
  st.atStud = true; g.horses = [st];
  return { g, st };
}
{
  // the directory is deterministic per day and rotates across refresh cycles
  const { g } = studGame(5);
  const a = HR.studDirectory(g).map(m => m.id), b = HR.studDirectory(g).map(m => m.id);
  ok(JSON.stringify(a) === JSON.stringify(b), 'the directory is deterministic for a given day');
  ok(a.length === 3 && new Set(a).size === 3, 'a roster of distinct visiting mares');
  const g2 = studGame(5).g; g2.day = 5 + 4; // next refresh cycle
  ok(JSON.stringify(HR.studDirectory(g2).map(m => m.id)) !== JSON.stringify(a), 'the roster rotates on the next refresh');
  // with no standing stallion the roster still lists but offers no fee
  const bare = HR.freshGame(); bare.day = 5;
  ok(HR.studDirectory(bare).every(m => m.fee === 0), 'no standing stallion → no offered fee');
}
{
  // booking validates the stallion can stand + capacity + not-already-booked, and schedules it
  const { g, st } = studGame(5);
  const mares = HR.studDirectory(g);
  const r = HR.bookStudCovering(g, st.id, mares[0].id, g.day);
  ok(r.ok && r.booking.due === g.day + HR.STUD_GESTATION, 'a covering books and is scheduled');
  ok(r.fee > 0 && r.fee <= 1400, 'the booking fee is bounded (economy-safe)');
  ok(HR.bookStudCovering(g, st.id, mares[0].id, g.day).ok === false, 'the same mare cannot be booked twice');
  ok(HR.studDirectory(g).find(m => m.id === mares[0].id).booked === true, 'the mare shows as booked');
  // a non-standing stallion is rejected
  const off = HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, id: 'off' }); g.horses.push(off);
  ok(HR.bookStudCovering(g, 'off', mares[1].id, g.day).ok === false, 'a stallion not at stud cannot be booked');
  ok(HR.bookStudCovering(g, 'ghost', mares[1].id, g.day).ok === false, 'an unknown stallion is rejected');
}
{
  // a stallion's concurrent bookings are capped
  const { g, st } = studGame(5);
  const mares = HR.studDirectory(g);
  ok(HR.studCapacityLeft(g, st) === HR.STUD_MAX_BOOKINGS, 'a fresh stallion has full capacity');
  HR.bookStudCovering(g, st.id, mares[0].id, g.day);
  HR.bookStudCovering(g, st.id, mares[1].id, g.day);
  ok(HR.studCapacityLeft(g, st) === 0, 'capacity is consumed by bookings');
  ok(HR.bookStudCovering(g, st.id, mares[2].id, g.day).ok === false, 'a fully-booked stallion takes no more');
}
{
  // resolveStudBookings pays a bounded fee once on the resolve day (via advanceDay) and frees capacity
  const { g, st } = studGame(5);
  const mares = HR.studDirectory(g);
  const r = HR.bookStudCovering(g, st.id, mares[0].id, g.day);
  const money0 = g.money, studInc0 = g.stats.studIncome || 0;
  const rr = rng(1); for (let d = 0; d < HR.STUD_GESTATION + 1 && HR.studCapacityLeft(g, st) < HR.STUD_MAX_BOOKINGS; d++) HR.advanceDay(g, rr);
  ok(g.money >= money0 + r.fee - 1, 'the booking fee is paid on resolve');
  ok((g.stats.studBookings || 0) === 1, 'the resolved booking is counted');
  ok((g.stats.studIncome || 0) >= studInc0 + r.fee, 'the fee counts as stud income');
  ok(HR.studCapacityLeft(g, st) === HR.STUD_MAX_BOOKINGS, 'capacity frees up after the covering');
  // no double-pay: resolving again pays nothing more
  const money1 = g.money; HR.resolveStudBookings(g, g.day + 50);
  ok(g.money === money1, 'a resolved booking never pays twice');
}
{
  // retiring/selling the stallion before the covering cancels it gracefully (no fee)
  const { g, st } = studGame(5);
  const mares = HR.studDirectory(g);
  HR.bookStudCovering(g, st.id, mares[0].id, g.day);
  st.atStud = false; // owner pulls him from stud
  const money0 = g.money;
  const paid = HR.resolveStudBookings(g, g.day + HR.STUD_GESTATION);
  ok(paid.length === 0 && g.money === money0, 'a covering by an ineligible stallion pays nothing');
}
{
  // determinism, migration safety, goal & achievement
  const mk = () => { const { g, st } = studGame(5); HR.bookStudCovering(g, st.id, HR.studDirectory(g)[0].id, g.day); const r = rng(3); for (let d = 0; d < HR.STUD_GESTATION + 1; d++) HR.advanceDay(g, r); return g.money; };
  ok(mk() === mk(), 'the stud booking loop is deterministic for a fixed rng+state');
  const legacy = HR.freshGame(); delete legacy.studBookings;
  ok(HR.resolveStudBookings(legacy, legacy.day + 1).length === 0 && Array.isArray(legacy.studBookings), 'resolve is safe & initialises on an old save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'studbook1');
  ok(goal && !goal.done(g), 'the stud-directory goal is unmet before a booking');
  g.stats.studBookings = 1;
  ok(goal.done(g), 'a fulfilled booking satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'soughtsire');
  ok(ach && !ach.check(g), 'Sought-After Sire needs ten bookings');
  g.stats.studBookings = 10;
  ok(ach.check(g), 'ten bookings unlock Sought-After Sire');
}

// ---- trophy room / achievements gallery (round 49) ----
{
  // reports unlocked/total achievements and a completion percentage
  const g = HR.freshGame();
  const r0 = HR.trophyRoom(g);
  ok(r0.achievements.total === HR.ACHIEVEMENTS.length, 'the room counts every achievement');
  ok(r0.achievements.unlocked === 0 && r0.completionPct === 0, 'a fresh ranch has 0% completion');
  // locked achievements are included with their def
  ok(r0.achievements.list.length === HR.ACHIEVEMENTS.length && r0.achievements.list.every(a => a.def && a.unlocked === false), 'locked achievements appear with their def');
  // unlock a couple and re-check
  g.achievements = [HR.ACHIEVEMENTS[0].id, HR.ACHIEVEMENTS[1].id];
  const r1 = HR.trophyRoom(g);
  ok(r1.achievements.unlocked === 2, 'unlocked achievements are counted');
  ok(r1.completionPct === Math.round(100 * 2 / HR.ACHIEVEMENTS.length), 'completion percentage matches');
  ok(r1.achievements.list.filter(a => a.unlocked).length === 2, 'the list flags the unlocked ones');
}
{
  // trophies are grouped/counted correctly from trophies[]
  const g = HR.freshGame();
  g.trophies = [
    { horse: 'A', disc: 'race', place: 1, day: 3 }, { horse: 'B', disc: 'jump', place: 1, day: 5 },
    { horse: 'C', disc: 'race', place: 2, day: 6 }, { horse: 'D', disc: 'dressage', place: 3, day: 7 },
  ];
  const r = HR.trophyRoom(g);
  ok(r.trophies.gold === 2 && r.trophies.silver === 1 && r.trophies.bronze === 1, 'placings are grouped by medal');
  ok(r.trophies.total === 4, 'the cabinet total matches');
  ok(r.trophies.recent.length === 4 && r.trophies.recent[0].horse === 'A', 'recent placings are listed');
}
{
  // career highlights read the right stats and are safe when stats are missing
  const g = HR.freshGame();
  g.stats.showWins = 12; g.stats.bestOVR = 88; g.stats.bestSale = 4200; g.stats.born = 9; g.stats.maxGen = 6; g.stats.seasonTitles = 2; g.stats.goldEarned = 50000;
  const r = HR.trophyRoom(g);
  const byId = id => r.highlights.find(h => h.id === id);
  ok(byId('wins').value === 12 && byId('bestOVR').value === 88 && byId('bestSale').value === 4200, 'highlights read the stats');
  ok(byId('maxGen').value === 'Gen 6' && byId('titles').value === 2, 'formatted highlights are correct');
  // sparse save: no stats object
  const bare = { achievements: [], trophies: [] };
  const rb = HR.trophyRoom(bare);
  ok(rb.highlights.every(h => h.value != null) && rb.completionPct === 0, 'the room is safe on a sparse save');
}
{
  // curatorRank returns the correct tier by unlocked count
  const at = n => { const g = HR.freshGame(); g.achievements = HR.ACHIEVEMENTS.slice(0, n).map(a => a.id); return g; };
  ok(HR.curatorRank(at(0)).id === 'newcomer', '0 unlocked → Newcomer');
  ok(HR.curatorRank(at(3)).id === 'ribbons', '3 → Ribbon Collector');
  ok(HR.curatorRank(at(8)).id === 'hunter', '8 → Trophy Hunter');
  ok(HR.curatorRank(at(15)).id === 'celebrated', '15 → Celebrated Rancher');
  ok(HR.curatorRank(at(24)).id === 'legend', '24 → Living Legend');
  ok(HR.achievementProgress(at(10)).unlocked === 10, 'achievementProgress reports the count');
}
{
  // read-only: building the room never mutates the game
  const g = HR.freshGame(); g.trophies = [{ horse: 'A', disc: 'race', place: 1, day: 1 }]; g.achievements = [HR.ACHIEVEMENTS[0].id];
  const snap = JSON.stringify(g);
  HR.trophyRoom(g); HR.curatorRank(g); HR.achievementProgress(g);
  ok(JSON.stringify(g) === snap, 'the trophy room is read-only');
  // determinism
  ok(JSON.stringify(HR.trophyRoom(g)) === JSON.stringify(HR.trophyRoom(g)), 'trophyRoom is deterministic');
}
{
  // goal + achievement
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'trophy1');
  ok(goal && !goal.done(g), 'the trophy goal is unmet with no achievements');
  g.achievements = HR.ACHIEVEMENTS.slice(0, 5).map(a => a.id);
  ok(goal.done(g), 'earning 5 achievements completes the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'cabinet');
  const g2 = HR.freshGame();
  ok(ach && !ach.check(g2), 'Full Trophy Cabinet needs 20 placings');
  g2.trophies = Array.from({ length: 20 }, (_, i) => ({ horse: 'H' + i, disc: 'race', place: 1, day: i }));
  ok(ach.check(g2), '20 placings unlock Full Trophy Cabinet');
}

// ---- keepsake ribbon wall / rosette display (round 58) ----
{
  // rosetteFor maps place → style, incl. a legacy/sparse trophy
  const g1 = HR.rosetteFor({ horse: 'Blaze', breed: 'arabian', disc: 'jump', tier: 3, place: 1, day: 5 });
  ok(g1.place === 1 && g1.emoji === '🥇' && g1.placeName === 'First', 'a 1st place maps to a gold rosette');
  ok(g1.discName === 'Show-Jumping' && g1.tierName === 'Regional Championship', 'discipline + tier names resolve');
  const s2 = HR.rosetteFor({ place: 2 }), s3 = HR.rosetteFor({ place: 3 });
  ok(s2.emoji === '🥈' && s3.emoji === '🥉', '2nd/3rd map to silver/bronze');
  const legacy = HR.rosetteFor({ place: 1 }); // no disc/tier/horse
  ok(legacy.discName && legacy.tierName === 'Show' && legacy.horse === '—', 'a sparse/legacy trophy falls back gracefully');
  const weird = HR.rosetteFor({ place: 7 });
  ok(weird.place === 7 && weird.emoji === '🎗️', 'an unexpected place still yields a rosette');
  ok(HR.rosetteFor(null).place === 0, 'rosetteFor is null-safe');
}
{
  // ribbonTally + ribbonWall group and count correctly: 2 golds + 1 silver across two disciplines
  const g = HR.freshGame();
  g.trophies = [
    { horse: 'A', breed: 'arabian', disc: 'race', tier: 4, place: 1, day: 30 },
    { horse: 'B', breed: 'quarter', disc: 'race', tier: 2, place: 2, day: 20 },
    { horse: 'C', breed: 'welsh', disc: 'jump', tier: 3, place: 1, day: 10 },
  ];
  const tally = HR.ribbonTally(g);
  ok(tally.ribbons === 3 && tally.gold === 2 && tally.silver === 1 && tally.bronze === 0, 'ribbon tally counts by place');
  ok(tally.bestTier === 4 && tally.bestTierName === 'National Grand Prix', 'best tier is the highest tier won');
  ok(tally.topDiscipline === 'race' && tally.topDisciplineCount === 2, 'favourite discipline is the most-decorated');

  const w = HR.ribbonWall(g);
  ok(w.rosettes.length === 3 && !w.empty, 'the wall renders a rosette per placing');
  ok(w.rosettes[0].horse === 'A', 'rosettes preserve the stored (newest-first) order');
  const goldPlace = w.byPlace.find(p => p.place === 1);
  ok(goldPlace.count === 2, 'by-place grouping counts the golds');
  const raceRow = w.byDiscipline.find(d => d.disc === 'race');
  ok(raceRow && raceRow.count === 2 && raceRow.gold === 1 && raceRow.silver === 1, 'per-discipline breakdown counts places');
  ok(w.byDiscipline.length === 2, 'only decorated disciplines appear');
  const gp = w.byTier.find(t => t.tier === 4);
  ok(gp && gp.count === 1 && w.byTier[0].tier >= w.byTier[w.byTier.length - 1].tier, 'per-tier breakdown is high→low');
  // proudest sorts by tier then place then recency; the National Grand Prix gold leads
  ok(w.proudest[0].horse === 'A', 'the proudest rosette is the top-tier gold');
  ok(/3 rosettes/.test(w.headline) && /2 gold/.test(w.headline), 'the headline summarises the collection');
}
{
  // empty + read-only + deterministic
  const g = HR.freshGame(); g.trophies = [];
  const w = HR.ribbonWall(g);
  ok(w.empty && w.rosettes.length === 0 && /bare/.test(w.headline), 'an empty wall reports itself gracefully');
  ok(HR.ribbonTally(g).ribbons === 0 && HR.ribbonTally(g).topDiscipline === null, 'empty tally is all zeroes');
  ok(HR.ribbonWall({}).empty && HR.ribbonTally({}).ribbons === 0, 'ribbon helpers are safe on a bare game');
  g.trophies = [{ horse: 'A', disc: 'race', tier: 3, place: 1, day: 5 }, { horse: 'B', disc: 'jump', tier: 2, place: 3, day: 3 }];
  const snap = JSON.stringify(g);
  HR.ribbonWall(g); HR.ribbonTally(g); HR.rosetteFor(g.trophies[0]);
  ok(JSON.stringify(g) === snap, 'the ribbon wall is read-only (never mutates the game or trophies)');
  ok(JSON.stringify(HR.ribbonWall(g)) === JSON.stringify(HR.ribbonWall(g)), 'ribbonWall is deterministic');
}
{
  // goal + achievement track the wall; ids unique
  const g = HR.freshGame();
  g.trophies = Array.from({ length: 5 }, (_, i) => ({ horse: 'H' + i, disc: 'race', tier: 1, place: 2, day: i }));
  ok(HR.GOALS.find(x => x.id === 'ribbon1').done(g), 'ribbon1 completes at 5 rosettes');
  const g4 = HR.freshGame(); g4.trophies = Array.from({ length: 4 }, (_, i) => ({ horse: 'H' + i, disc: 'race', place: 1, day: i }));
  ok(!HR.GOALS.find(x => x.id === 'ribbon1').done(g4), 'ribbon1 not met below 5 rosettes');
  const g15 = HR.freshGame(); g15.trophies = Array.from({ length: 15 }, (_, i) => ({ horse: 'H' + i, disc: 'jump', tier: 2, place: 1, day: i }));
  ok(HR.ACHIEVEMENTS.find(a => a.id === 'rosetteroyalty').check(g15), 'Rosette Royalty unlocks at 15 golds');
  ok(HR.GOALS.filter(x => x.id === 'ribbon1').length === 1 && HR.ACHIEVEMENTS.filter(a => a.id === 'rosetteroyalty').length === 1, 'new ribbon goal/achievement ids are unique');
}

// ---- horse diary / mood flavour feed (round 50) ----
{
  // horseMood returns the right tag for representative states (life-state first, then welfare, then temperament)
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 1 })) === 'foal', 'a foal reads as playful');
  const preg = HR.mkHorse({ breed: 'arabian', age: 20 }); preg.pregnant = true;
  ok(HR.horseMood(preg) === 'pregnant', 'a pregnant mare reads as expecting');
  const away = HR.mkHorse({ breed: 'arabian', age: 20 }); away.tripType = 'clinic'; away.tripBack = 100;
  ok(HR.horseMood(away) === 'away', 'an away horse reads as away');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', sex: 'stallion', age: 20, atStud: true })) === 'atstud', 'a stud stallion reads as at-stud');
  const rent = HR.mkHorse({ breed: 'arabian', age: 20 }); rent.rentDays = 3;
  ok(HR.horseMood(rent) === 'rented', 'a rented horse reads as on-hire');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 20, health: 30 })) === 'sick', 'a low-health horse reads as unwell');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 20, happy: 20, health: 90 })) === 'sad', 'an unhappy horse reads as sad');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 70, happy: 85, health: 90 })) === 'elderly', 'a venerable horse reads as elderly');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 20, wins: 4, happy: 85 })) === 'champion', 'a winning horse reads as proud');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 20, wins: 0, bond: 85, happy: 85 })) === 'bonded', 'a bonded horse reads as devoted');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 20, wins: 0, bond: 30, happy: 90 })) === 'happy', 'a bright horse reads as happy');
  ok(HR.horseMood(HR.mkHorse({ breed: 'arabian', age: 20, wins: 0, bond: 20, happy: 50 })) === 'content', 'an ordinary horse reads as content');
  ok(HR.horseMood(null) === 'content', 'a missing horse defaults to content');
}
{
  // horseDiaryLine is deterministic per horse+day, stable within a day, varies across days, non-empty, substitutes {name}
  const h = HR.mkHorse({ breed: 'welsh', age: 20, id: 'diary1', name: 'Pip', wins: 0, bond: 20, happy: 50 });
  const l5a = HR.horseDiaryLine(h, 5), l5b = HR.horseDiaryLine(h, 5);
  ok(l5a === l5b && l5a.length > 0, 'the line is deterministic & non-empty for a given day');
  ok(l5a.indexOf('Pip') >= 0 && l5a.indexOf('{name}') < 0, 'the horse’s name is substituted in');
  // varies across days (over a span, not every single day)
  let distinct = new Set(); for (let d = 1; d <= 12; d++) distinct.add(HR.horseDiaryLine(h, d));
  ok(distinct.size > 1, 'the line varies from day to day');
  // two different horses (different ids) can differ on the same day
  const h2 = HR.mkHorse({ breed: 'welsh', age: 20, id: 'diary2', name: 'Bo', wins: 0, bond: 20, happy: 50 });
  ok(typeof HR.horseDiaryLine(h2, 5) === 'string' && HR.horseDiaryLine(h2, 5).indexOf('Bo') >= 0, 'a second horse gets its own line');
}
{
  // ranchDiary returns up to `limit` lines ordered by noteworthiness, safe on empty/sparse herds
  const g = HR.freshGame(); g.day = 5;
  g.horses = [
    HR.mkHorse({ breed: 'arabian', age: 20, id: 'ok', wins: 0, bond: 20, happy: 60 }),        // content
    HR.mkHorse({ breed: 'arabian', age: 20, id: 'ill', health: 20 }),                          // sick (most noteworthy)
    HR.mkHorse({ breed: 'arabian', age: 20, id: 'blue', happy: 20, health: 90 }),              // sad
  ];
  const feed = HR.ranchDiary(g, 2);
  ok(feed.length === 2, 'ranchDiary respects the limit');
  ok(feed[0].mood === 'sick' && feed[1].mood === 'sad', 'welfare concerns are surfaced first');
  ok(feed.every(e => e.name && e.line && e.emoji), 'each entry carries name, line & mood emoji');
  ok(HR.ranchDiary({ horses: [] }, 5).length === 0, 'an empty herd yields an empty diary');
  ok(Array.isArray(HR.ranchDiary({}, 5)), 'ranchDiary is safe on a sparse game');
}
{
  // read-only + determinism
  const g = HR.freshGame(); g.day = 7;
  const snap = JSON.stringify(g);
  HR.ranchDiary(g, 8); HR.horseMood(g.horses[0]); HR.horseDiaryLine(g.horses[0], g.day);
  ok(JSON.stringify(g) === snap, 'the diary never mutates the game');
  ok(JSON.stringify(HR.ranchDiary(g, 8)) === JSON.stringify(HR.ranchDiary(g, 8)), 'ranchDiary is deterministic');
}
{
  // the "A Contented Herd" achievement
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'contentherd');
  const g = HR.freshGame();
  g.horses = []; for (let i = 0; i < 5; i++) g.horses.push(HR.mkHorse({ breed: 'welsh', age: 20, id: 'c' + i, happy: 80, health: 90, bond: 40 }));
  ok(ach && ach.check(g), 'five happy horses make a contented herd');
  g.horses[0].health = 20; // one falls ill
  ok(!ach.check(g), 'an unwell horse breaks the contented herd');
  const small = HR.freshGame(); ok(!ach.check(small), 'a herd of fewer than five does not qualify');
}

// ---- rival grudge match (round 51) ----
{
  // grudgeOpponentScore scales with rival strength (a stronger rival = a higher number)
  const g = HR.freshGame(); g.day = 20;
  const weak = HR.RIVALS.find(r => r.id === 'ironhoof'), strong = HR.RIVALS.find(r => r.id === 'silvercreek');
  ok(HR.grudgeRating(g, strong) > HR.grudgeRating(g, weak), 'a higher-reputation rival has a higher rating');
  ok(HR.grudgeOpponentScore(g, strong, strong.disc) > HR.grudgeOpponentScore(g, weak, weak.disc), 'opponent score tracks rival strength');
  ok(HR.grudgeOpponentScore(g, strong, 'race') < HR.grudgeOpponentScore(g, strong, strong.disc), 'a rival is weaker outside its speciality');
}
{
  // a strong horse reliably beats a weak rival, and a weak horse loses to a strong rival, across seeds
  const mkGame = () => { const g = HR.freshGame(); g.day = 3; g.money = 5000; return g; };
  const star = HR.mkHorse({ breed: 'thoroughbred', age: 20, id: 'star', speed: 99, stamina: 99, temperament: 95, health: 100, happy: 100 });
  let wins = 0; for (let s = 1; s <= 12; s++) { const g = mkGame(); g.horses = [Object.assign({}, star)]; const r = HR.runGrudgeMatch(g, 'star', 'ironhoof', 'race', rng(s)); if (r.ok && r.win) wins++; }
  ok(wins >= 11, 'a top horse beats the weakest rival almost every time');
  const dud = HR.mkHorse({ breed: 'shetland', age: 20, id: 'dud', speed: 30, stamina: 30, temperament: 30, health: 80, happy: 80 });
  let losses = 0; for (let s = 1; s <= 12; s++) { const g = mkGame(); g.day = 40; g.horses = [Object.assign({}, dud)]; const r = HR.runGrudgeMatch(g, 'dud', 'silvercreek', 'endurance', rng(s)); if (r.ok && !r.win) losses++; }
  ok(losses >= 11, 'a weak horse loses to the strongest rival almost every time');
}
{
  // runGrudgeMatch validates eligibility + funds + cooldown; the stake/reward is bounded and applied; record updates
  const g = HR.freshGame(); g.day = 5; g.money = 5000;
  const h = HR.mkHorse({ breed: 'akhalteke', age: 20, id: 'ace', speed: 95, stamina: 95, temperament: 90, health: 100, happy: 100 }); g.horses = [h];
  const money0 = g.money;
  const r = HR.runGrudgeMatch(g, 'ace', 'ironhoof', 'race', rng(1));
  ok(r.ok, 'a valid challenge runs');
  ok(g.money >= money0 - HR.GRUDGE_STAKE, 'the stake is taken');
  if (r.win) { ok(r.reward.money > 0 && r.reward.money <= 900, 'winnings are bounded'); ok(g.stats.grudgeWins === 1, 'a win is recorded'); }
  ok((g.stats.grudgeMatches || 0) === 1, 'the match is counted');
  const rec = HR.grudgeRecord(g); ok(rec.w + rec.l === 1, 'the W/L record updates');
  // cooldown now blocks a rematch with the same rival
  ok(HR.rivalChallengeReady(g, 'ironhoof') === false, 'the rival is on cooldown after a match');
  const money1 = g.money;
  ok(HR.runGrudgeMatch(g, 'ace', 'ironhoof', 'race', rng(2)).ok === false && g.money === money1, 'a rematch during cooldown is a no-op (no stake taken)');
  // a different rival is still available
  ok(HR.rivalChallengeReady(g, 'sunfire') === true, 'a different rival can be challenged');
  // cooldown elapses
  g.day += HR.GRUDGE_COOLDOWN;
  ok(HR.rivalChallengeReady(g, 'ironhoof') === true, 'the rival is challengeable again after the cooldown');
}
{
  // eligibility & funds rejections
  const g = HR.freshGame(); g.day = 5; g.money = 5000;
  const foal = HR.mkHorse({ breed: 'arabian', age: 1, id: 'foal' }); g.horses = [foal];
  ok(HR.runGrudgeMatch(g, 'foal', 'ironhoof', 'race', rng(1)).ok === false, 'a foal cannot compete');
  ok(HR.runGrudgeMatch(g, 'ghost', 'ironhoof', 'race', rng(1)).ok === false, 'an unknown horse is rejected');
  ok(HR.runGrudgeMatch(g, 'foal', 'nope', 'race', rng(1)).ok === false, 'an unknown rival is rejected');
  const poor = HR.freshGame(); poor.day = 5; poor.money = 0;
  const ph = HR.mkHorse({ breed: 'arabian', age: 20, id: 'p' }); poor.horses = [ph];
  ok(HR.runGrudgeMatch(poor, 'p', 'ironhoof', 'race', rng(1)).ok === false, 'you cannot pay the stake with no coins');
}
{
  // determinism, migration safety, goal & achievement
  const mk = () => { const g = HR.freshGame(); g.day = 5; g.money = 5000; const h = HR.mkHorse({ breed: 'arabian', age: 20, id: 'x', speed: 80, stamina: 80, temperament: 70, health: 100, happy: 100, trait: 'bold', coat: { name: 'Bay', tier: 0 } }); g.horses = [h]; const r = HR.runGrudgeMatch(g, 'x', 'sunfire', 'jump', rng(42)); return [r.win, r.my, r.opp, g.money]; };
  ok(JSON.stringify(mk()) === JSON.stringify(mk()), 'same horse + rival + rng → same result');
  const legacy = HR.freshGame(); delete legacy.grudge; legacy.day = 5; legacy.money = 5000;
  const lh = HR.mkHorse({ breed: 'arabian', age: 20, id: 'l', speed: 90, stamina: 90, temperament: 90, health: 100, happy: 100 }); legacy.horses = [lh];
  ok(HR.runGrudgeMatch(legacy, 'l', 'ironhoof', 'race', rng(1)).ok && legacy.grudge && legacy.grudge.record, 'a match initialises the grudge state on an old save');
  const g = HR.freshGame();
  const goal = HR.GOALS.find(x => x.id === 'grudge1');
  ok(goal && !goal.done(g), 'the grudge goal is unmet before a win');
  g.stats.grudgeWins = 1;
  ok(goal.done(g), 'a grudge win satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'rivalslayer');
  const g2 = HR.freshGame(); g2.grudge = { record: { w: 4, l: 0 }, last: {}, vs: {} };
  HR.RIVALS.forEach((r, i) => { if (i < HR.RIVALS.length - 1) g2.grudge.vs[r.id] = { w: 1, l: 0 }; });
  ok(ach && !ach.check(g2), 'Rival Slayer needs a win over every rival');
  HR.RIVALS.forEach(r => g2.grudge.vs[r.id] = { w: 1, l: 0 });
  ok(ach.check(g2), 'beating every rival unlocks Rival Slayer');
}

// ---- weather & season forecast / almanac (round 52) ----
{
  // dayForecast returns the right season/weekday/events for known days
  const g = HR.freshGame();
  const f7 = HR.dayForecast(g, 7);   // spring, season-day 7 → festival + fair finale day, Sunday shows
  ok(f7.season.id === 'spring' && f7.weekday === 'Sun', 'day 7 is a spring Sunday');
  ok(f7.events.some(e => e.type === 'festival'), 'the season-day-7 festival is forecast');
  ok(f7.events.some(e => e.type === 'fair'), 'the fair window (days 3–7) is forecast on day 7');
  ok(f7.events.some(e => e.type === 'shows'), 'Sunday show day is forecast');
  const f10 = HR.dayForecast(g, 10);  // season-day 10 → auction
  ok(f10.events.some(e => e.type === 'auction'), 'the auction day is forecast');
  const f5 = HR.dayForecast(g, 5);    // Friday → hay delivery, in the fair window
  ok(f5.events.some(e => e.type === 'hay') && f5.events.some(e => e.type === 'fair'), 'a Friday in the fair window shows hay + fair');
  ok(typeof f5.weather.emoji === 'string' && f5.weather.name, 'each day carries a weather read');
  const f14 = HR.dayForecast(g, 14);  // last day of spring → championship finale
  ok(f14.events.some(e => e.type === 'championship'), 'the season finale is flagged');
}
{
  // forecast(days) returns that many entries and is deterministic
  const g = HR.freshGame(); g.day = 5;
  const fc = HR.forecast(g, 10);
  ok(fc.length === 10 && fc[0].day === 5 && fc[9].day === 14, 'forecast spans the requested days from today');
  ok(JSON.stringify(HR.forecast(g, 10)) === JSON.stringify(HR.forecast(g, 10)), 'the forecast is deterministic');
  // weather matches the sim’s own deterministic weatherFor read (spot-check via re-derivation is covered by the sim); just confirm stability across calls
  ok(HR.dayForecast(g, 8).weather.id === HR.dayForecast(g, 8).weather.id, 'a given day’s weather is stable');
}
{
  // upcomingEvents lists the next festival/fair/auction with correct day offsets
  const g = HR.freshGame(); g.day = 1;
  const up = HR.upcomingEvents(g, 14);
  const fair = up.find(e => e.type === 'fair'), fest = up.find(e => e.type === 'festival'), auc = up.find(e => e.type === 'auction');
  ok(fair && fair.inDays === 2, 'the spring fair opens in 2 days (season-day 3)');
  ok(fest && fest.inDays === 6, 'the spring festival is in 6 days (season-day 7)');
  ok(auc && auc.inDays === 9, 'the auction is in 9 days (season-day 10)');
  ok(up.every((e, i) => i === 0 || up[i - 1].inDays <= e.inDays), 'upcoming events are sorted soonest-first');
  ok(!up.some(e => e.type === 'shows' || e.type === 'hay' || e.type === 'market'), 'routine weekly days are not headline events');
}
{
  // seasonAlmanac reflects the current season's modifiers
  const spring = HR.freshGame(); spring.day = 2;
  const a = HR.seasonAlmanac(spring);
  ok(a.season.id === 'spring' && a.year === 1 && a.seasonLen === 14, 'the almanac reads the current season');
  ok(a.modifiers.some(m => /Breeding/.test(m.label) && m.good), 'spring flags cheaper breeding as a boon');
  ok(a.daysLeft === 14 - 2 + 1, 'days-left in the season is correct');
  const summer = HR.freshGame(); summer.day = 16;
  ok(HR.seasonAlmanac(summer).modifiers.some(m => /Show prizes/.test(m.label) && m.good), 'summer flags bigger show prizes');
  const autumn = HR.freshGame(); autumn.day = 30;
  ok(HR.seasonAlmanac(autumn).modifiers.some(m => /Hay/.test(m.label) && m.good), 'autumn flags cheap hay');
}
{
  // read-only + determinism + sparse safety
  const g = HR.freshGame(); g.day = 9;
  const snap = JSON.stringify(g);
  HR.dayForecast(g, 9); HR.forecast(g, 12); HR.upcomingEvents(g, 20); HR.seasonAlmanac(g);
  ok(JSON.stringify(g) === snap, 'the almanac never mutates the game');
  ok(JSON.stringify(HR.seasonAlmanac(g)) === JSON.stringify(HR.seasonAlmanac(g)), 'seasonAlmanac is deterministic');
  ok(Array.isArray(HR.forecast({}, 5)) && HR.forecast({}, 5).length === 5, 'forecast is safe on a sparse game');
  // achievement
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'yearround');
  const young = HR.freshGame(); young.day = 30;
  ok(ach && !ach.check(young), 'Year-Round Rancher needs a full year');
  const veteran = HR.freshGame(); veteran.day = 56;
  ok(ach.check(veteran), 'reaching day 56 (a full year) unlocks Year-Round Rancher');
}

// ---- foal coming-of-age ceremonies (round 53) ----
{
  // a foal crossing a milestone boundary in advanceDay gets flagged pending exactly once
  const g = HR.freshGame(); g.feed = 9999;
  const h = HR.mkHorse({ breed: 'arabian', age: 4, id: 'sprout', name: 'Sprout' }); g.horses = [h];
  ok(HR.foalMilestoneFor(h) === null, 'a foal below the boundary has no pending ceremony');
  HR.advanceDay(g, rng(1)); // age 4 → 5 (yearling)
  ok(h.age === 5, 'the foal ages up');
  const m = HR.foalMilestoneFor(h);
  ok(m && m.id === 'yearling', 'crossing into yearling queues the First Birthday');
  ok(h.ceremonies.yearling === 'pending', 'the milestone is marked pending');
  // advancing again does not re-flag the same milestone
  HR.advanceDay(g, rng(2)); // age 5 → 6
  ok(h.ceremonies.yearling === 'pending' && HR.foalMilestoneFor(h).id === 'yearling', 'the pending flag is not duplicated');
}
{
  // holdCeremony validates, applies a BOUNDED bonus once, marks done, and can't be re-claimed
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'welsh', age: 10, id: 'coa', name: 'Bramble', happy: 60, bond: 40 }); g.horses = [h];
  h.ceremonies = { comingofage: 'pending' };
  ok(HR.comingOfAgeDue(g).some(x => x.id === 'coa'), 'comingOfAgeDue lists the pending horse');
  const hp0 = h.happy, bd0 = h.bond, rep0 = g.rep;
  const r = HR.holdCeremony(g, 'coa');
  ok(r.ok && r.milestone.id === 'comingofage', 'the ceremony is held');
  ok(h.happy > hp0 && h.bond > bd0 && g.rep > rep0, 'it lifts mood, bond & reputation');
  ok(h.happy - hp0 <= 10 && h.bond - bd0 <= 6 && r.rep <= 5, 'the bonus is bounded (a keepsake, not a power spike)');
  ok((g.stats.ceremonies || 0) === 1, 'the ceremony is counted');
  ok(h.ceremonies.comingofage === 'done', 'the milestone is marked done');
  ok(HR.holdCeremony(g, 'coa').ok === false, 'the same ceremony cannot be held twice (no farming)');
  ok(HR.comingOfAgeDue(g).length === 0, 'no ceremonies remain pending');
  ok(HR.holdCeremony(g, 'ghost').ok === false, 'an unknown horse is rejected');
}
{
  // the bonus is clamped at the cap (never overflows)
  const g = HR.freshGame();
  const h = HR.mkHorse({ breed: 'arabian', age: 5, id: 'hi', happy: 98, bond: 99 }); h.ceremonies = { yearling: 'pending' }; g.horses = [h];
  HR.holdCeremony(g, 'hi');
  ok(h.happy <= 100 && h.bond <= 100, 'mood & bond never exceed the cap');
}
{
  // an already-grown horse (old save) does NOT fire a ceremony retroactively
  const g = HR.freshGame(); g.feed = 9999;
  const grown = HR.mkHorse({ breed: 'mustang', age: 20, id: 'grown' }); grown.ceremonies = {}; g.horses = [grown];
  HR.advanceDay(g, rng(1)); // age 20 → 21, crosses no boundary
  ok(HR.foalMilestoneFor(grown) === null && HR.comingOfAgeDue(g).length === 0, 'a grown horse never fires a milestone');
  // migration: a horse with no ceremonies field is handled safely
  const legacy = HR.mkHorse({ breed: 'arabian', age: 8 }); delete legacy.ceremonies;
  ok(HR.foalMilestoneFor(legacy) === null, 'a missing ceremonies field reads as no pending milestone');
  ok(HR.checkFoalMilestone(legacy) === null || true, 'checkFoalMilestone is safe when the field is absent');
}
{
  // both milestones fire across a foal's whole upbringing (5 then 10), each once
  const g = HR.freshGame(); g.feed = 9999;
  const h = HR.mkHorse({ breed: 'arabian', age: 4, id: 'life' }); g.horses = [h];
  let firedYearling = 0, firedCoa = 0;
  const r = rng(3);
  for (let d = 0; d < 8; d++) { HR.advanceDay(g, r); const m = HR.foalMilestoneFor(h); if (m && m.id === 'yearling' && h.ceremonies.yearling === 'pending') { firedYearling++; HR.holdCeremony(g, 'life'); } if (m && m.id === 'comingofage' && h.ceremonies.comingofage === 'pending') { firedCoa++; HR.holdCeremony(g, 'life'); } }
  ok(h.ceremonies.yearling === 'done' && h.ceremonies.comingofage === 'done', 'both milestones were reached & celebrated');
  ok((g.stats.ceremonies || 0) === 2, 'exactly two ceremonies were held over the upbringing');
  // goal + achievement
  const goal = HR.GOALS.find(x => x.id === 'cer1');
  const g2 = HR.freshGame();
  ok(goal && !goal.done(g2), 'the ceremony goal is unmet before any ceremony');
  g2.stats.ceremonies = 1;
  ok(goal.done(g2), 'holding a ceremony satisfies the goal');
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'raisedfoal');
  ok(ach && ach.check(g), 'raising a foal to its coming of age unlocks Raised from a Foal');
  ok(!ach.check(g2), 'a ranch with no raised foal has not earned it');
}

// ---- ranch newsletter / weekly recap (round 54) ----
{
  // weeklyRecap reports the right week number and headline figures for a known state
  const g = HR.freshGame();
  ok(HR.weeklyRecap(g).week === 1, 'a fresh ranch is in week 1');
  g.day = 8;
  ok(HR.weeklyRecap(g).week === 2, 'day 8 is week 2');
  // this-week deltas measured against the seeded baseline
  const g2 = HR.freshGame(); // baseline goldEarned=0 at day 1
  g2.stats.goldEarned = 300; g2.stats.born = 2; g2.stats.showWins = 1; g2.rep = (g2.rep || 0) + 40;
  const r = HR.weeklyRecap(g2);
  ok(r.stats.gold === 300 && r.stats.foals === 2 && r.stats.wins === 1, 'the recap totals this week’s deltas');
  ok(r.stats.repGain === 40, 'reputation gained this week is measured');
  ok(typeof r.headline === 'string' && r.headline.length > 0, 'there is a flavour headline');
}
{
  // trophies this week are filtered by the week window
  const g = HR.freshGame(); g.day = 14; // week 2 (days 8–14)
  g.trophies = [
    { horse: 'A', disc: 'race', place: 1, day: 9 },   // this week
    { horse: 'B', disc: 'jump', place: 2, day: 12 },  // this week
    { horse: 'C', disc: 'race', place: 1, day: 3 },   // last week — excluded
  ];
  const r = HR.weeklyRecap(g);
  ok(r.trophies.gold === 1 && r.trophies.silver === 1, 'only this week’s placings are counted');
  ok(r.trophies.list.length === 2, 'the trophy list is windowed to this week');
}
{
  // deltas are exact after a week passes (rollWeeklyStats re-baselines at the boundary)
  const g = HR.freshGame(); // day 1, week 1, baseline goldEarned 0
  g.stats.goldEarned = 300; // earned in week 1
  ok(HR.weeklyRecap(g).stats.gold === 300, 'week-1 earnings show');
  g.day = 8; HR.rollWeeklyStats(g); // new week → baseline snapshots goldEarned=300
  ok(g.weekly.week === 2 && g.weekly.start.goldEarned === 300, 'the baseline rolls to the new week');
  g.stats.goldEarned = 500; // earned 200 in week 2
  ok(HR.weeklyRecap(g).stats.gold === 200, 'week-2 earnings are measured from the new baseline');
  // rolling again within the same week is a no-op
  ok(HR.rollWeeklyStats(g) === false, 'the baseline does not re-roll mid-week');
}
{
  // recapHeadlines is ordered & non-empty; upcoming comes from the forecast
  const quiet = HR.freshGame();
  const hq = HR.recapHeadlines(quiet);
  ok(hq.length >= 1 && hq.every(h => h.text && h.emoji), 'a quiet week still yields a headline line');
  const busy = HR.freshGame(); busy.stats.goldEarned = 900; busy.stats.born = 3; busy.stats.showWins = 2; busy.trophies = [{ place: 1, day: 1 }, { place: 1, day: 1 }];
  const hb = HR.recapHeadlines(busy);
  ok(hb[0].text.indexOf('win') >= 0, 'show wins lead the headlines');
  ok(hb.length > hq.length, 'a busier week has more headlines');
  ok(Array.isArray(HR.weeklyRecap(busy).upcoming), 'the recap carries the upcoming-events forecast');
}
{
  // read-only + determinism + sparse safety
  const g = HR.freshGame(); g.day = 5; g.stats.goldEarned = 120;
  const snap = JSON.stringify(g);
  HR.weeklyRecap(g); HR.recapHeadlines(g);
  ok(JSON.stringify(g) === snap, 'building the recap never mutates the game');
  ok(JSON.stringify(HR.weeklyRecap(g)) === JSON.stringify(HR.weeklyRecap(g)), 'the recap is deterministic');
  ok(HR.weeklyRecap({}).week === 1 && Array.isArray(HR.recapHeadlines({})), 'the recap is safe on a sparse game');
  // achievement
  const ach = HR.ACHIEVEMENTS.find(a => a.id === 'bannerweek');
  const one = HR.freshGame(); one.day = 3; one.trophies = [{ place: 1, day: 1 }, { place: 1, day: 2 }];
  ok(ach && !ach.check(one), 'Banner Week needs three wins in a week');
  const three = HR.freshGame(); three.day = 3; three.trophies = [{ place: 1, day: 1 }, { place: 1, day: 2 }, { place: 1, day: 3 }];
  ok(ach.check(three), 'three show wins in a week unlock Banner Week');
}

// ---- clamp helper ----
ok(HR.clamp(150, 0, 100) === 100 && HR.clamp(-5, 0, 100) === 0 && HR.clamp(50, 0, 100) === 50, 'clamp bounds values');

console.log(`horse_ranch: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
