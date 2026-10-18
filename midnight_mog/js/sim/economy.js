// Midnight Mog economy: the single source of truth for every curve.
// Pure functions only. No DOM, no Date, no Math.random. Time is always passed in.
//
// Framework (idle-game growth):
//   cost(level)   = base * growth^level, with a steeper second growth past a soft level
//   income        = baseRate * (1 + sum(additive bonuses in a tier)) * tierA * tierB * ...
//                   (additive inside a tier, multiplicative across tiers)
//   soft caps     = x <= cap ? x : cap * (x / cap)^exp   (continuous, diminishing)
//
// See docs/ECONOMY.md for the tables and the reasoning.

// ---------------------------------------------------------------- constants

export const STAGES_PER_DISTRICT = 30;
export const BATTLE_SECONDS = 90;          // average length of one battle (design target)
export const MAX_CUR = 1e15;               // hard clamp for every currency (float safety)
export const RARITIES = ['common', 'rare', 'epic', 'legend', 'mythic'];

// Rarity multiplier on upgrade costs (cats and cards of higher rarity cost more to level).
export const RARITY_COST_MULT = { common: 1, rare: 2.5, epic: 7, legend: 20, mythic: 60 };

// Yarn refunded when a duplicate drops (dupes also feed stars in progression.js).
export const DUPE_YARN = { common: 12, rare: 45, epic: 170, legend: 650, mythic: 2500 };

// Geometric cost tables. cost(level) = base * growth^min(level, softAt) * growth2^max(0, level - softAt)
export const CURVES = {
  cat_level:      { cur: 'yarn', base: 25,  growth: 1.12, softAt: 60, growth2: 1.17, maxLevel: 120 },
  card_level:     { cur: 'yarn', base: 18,  growth: 1.14, softAt: 40, growth2: 1.19, maxLevel: 80 },
  building_level: { cur: 'fish', base: 90,  growth: 1.20, softAt: 30, growth2: 1.26, maxLevel: 80 },
  unlock_slot:    { cur: 'fish', base: 600, growth: 3.4,  softAt: 12, growth2: 3.4,  maxLevel: 12 },
};

// Crates cost soft currency only (money-free). Ids are matched by name; unknown ids fall back
// by tier order (see crateCost). Price creeps up with opens in the current Nine Lives so that
// a rich player cannot flatten the pity curve for free. creep = +1.5% per open, capped at x3.
export const CRATE_PRICES = {
  alley_crate:    { cur: 'fish', price: 400 },
  neon_crate:     { cur: 'fish', price: 3000 },
  rooftop_crate:  { cur: 'yarn', price: 2500 },
  midnight_crate: { cur: 'gems', price: 60 },
  mythic_crate:   { cur: 'gems', price: 300 },
};
const CRATE_FALLBACK = [
  { cur: 'fish', price: 400 }, { cur: 'fish', price: 3000 }, { cur: 'yarn', price: 2500 },
  { cur: 'gems', price: 60 }, { cur: 'gems', price: 300 },
];
export const CRATE_CREEP = 0.015;
export const CRATE_CREEP_CAP = 3;

// Reward curves per battle win (before multipliers). gs = global stage index.
export const REWARD = {
  fish:  { base: 10, growth: 1.072 },
  yarn:  { base: 1.8, growth: 1.062 },
  // gems: boss stages only (every 10th), first clear of a stage in this Nine Lives, plus daily
  gemsBoss: 2, gemsBossPerDistrict: 1, gemsDaily: 10, gemsDailyCapPerDay: 40,
  repeatDecay: 0.55,       // replaying an already cleared stage pays this fraction
  firstClearBonus: 2.5,    // first clear of a stage pays this multiple of the base
};

// Town: passive production per building kind, per second, at level 1.
export const BUILDING_BASE = { fish: 0.45, yarn: 0.06 };
export const BUILDING_LEVEL_GROWTH = 1.05; // output = base * level * 1.05^(level - 1)
export const TOWN_STORAGE_SECONDS = 4 * 3600; // un-collected production stops after this long

// Offline: base cap 8h, +2h per meta level up to 24h. Efficiency of offline vs active income.
export const OFFLINE = {
  baseCapHours: 8, capHoursPerLevel: 2, maxCapHours: 24,
  fullEffHours: 2,             // first 2h at base efficiency
  baseEff: 0.35, effPerLevel: 0.05, maxEff: 0.6,
  tailMult: 0.5,               // hours past fullEffHours pay half
};

// Nine Lives prestige
export const NINE_LIVES = {
  minStage: 30,                // best global stage this run needed to be allowed to reset
  shardCoef: 1.5, shardExp: 1.6, shardDiv: 10,
  incomeCoef: 0.06, incomeExp: 0.8,   // income mult  = 1 + 0.06 * S^0.8
  damageCoef: 0.08, damageExp: 0.7,   // damage mult  = 1 + 0.08 * S^0.7
  echoFraction: 0.6, echoSeconds: 20, // after a reset, stages below 60% of the previous run's best clear in 20s (echo clears, replay pay)
  maxResets: 1e9,              // unlimited (endless loop); count 9 unlocks the cosmetic ascension tier
};

// Meta perks bought with tokens (cost = base * growth^level).
export const META = {
  offline_cap:   { base: 5,  growth: 1.9, maxLevel: 8 },
  offline_eff:   { base: 8,  growth: 1.8, maxLevel: 5 },
  start_fish:    { base: 3,  growth: 1.6, maxLevel: 20 },
  crate_luck:    { base: 20, growth: 2.1, maxLevel: 5 },
  extra_slot:    { base: 30, growth: 2.5, maxLevel: 3 },
};

// Soft-capped bonus pools (additive inside the pool, then softCap)
export const POOLS = {
  relic:  { each: 0.06, cap: 1.5, exp: 0.5 },   // each relic +6%, soft cap at +150%
  star:   { each: 0.03, cap: 1.0, exp: 0.5 },   // each cat star +3%
  town:   { each: 0.02, cap: 1.0, exp: 0.5 },   // each town building level beyond 1, +2% to battle fish
};

// ------------------------------------------------------------------ targets
// What the bots test against. "stage" is the global stage index reached by an engaged player
// who plays continuously (no idle gaps) and spends optimally-ish (see modelCampaign). Casual
// players are slower by their idle ratio. Bands are inclusive.
export const TARGETS = {
  battleSeconds: BATTLE_SECONDS,
  sessions: [
    { id: '2min',  seconds: 120,         stage: [2, 5],     note: 'first win, first card level' },
    { id: '10min', seconds: 600,         stage: [5, 12],    note: 'first crate, first building' },
    { id: '1hour', seconds: 3600,        stage: [25, 42],   note: 'district 1 boss region, first wall approaches' },
    { id: '1day',  seconds: 86400,       stage: [85, 130],  note: 'continuous play with Nine Lives resets' },
    { id: '1week', seconds: 7 * 86400,   stage: [110, 175], note: 'long tail: about +15 stages per doubling of shards' },
  ],
  // A run (no prestige) walls at roughly this global stage: progress under 2 stages per hour.
  runWallStage: [80, 115],
  firstResetActiveHours: [3, 8],     // continuous play until the first Nine Lives is attractive
  nineLivesSpeedup: [2, 6],          // a prestiged run reaches stage 30 this many times faster
  offlineCapHours: [8, 24],
  offlineEfficiency: [0.35, 0.6],
  gemsPerActiveHour: [3, 12],        // never "bought", earned slowly
  crateReturnMax: 0.9,               // expected dupe-yarn per crate must be below 90% of its price
  maxCurrency: MAX_CUR,
};

// ------------------------------------------------------------------ helpers

export function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
function fin(x) { return Number.isFinite(x) ? x : 0; }

export function softCap(x, cap, exp = 0.5) {
  if (x <= cap) return x;
  return cap * Math.pow(x / cap, exp);
}

/** Round currency amounts for display and storage: floor to integer, clamp to MAX_CUR. */
export function money(x) { return Math.floor(clamp(fin(x), 0, MAX_CUR)); }

/** Global stage index, 1 based. District and stage are both 1 based in the profile. */
export function globalStage(district, stage) {
  const d = Math.max(1, Math.floor(district || 1));
  const s = Math.max(1, Math.floor(stage || 1));
  return (d - 1) * STAGES_PER_DISTRICT + s;
}

export function bestGlobalStage(profile) {
  const p = profile && profile.progress;
  if (!p) return 1;
  let best = globalStage(p.district, p.stage);
  const b = p.best || {};
  for (const k of Object.keys(b)) best = Math.max(best, globalStage(Number(k), b[k]));
  return best;
}

// ------------------------------------------------------------------- costs

function geometric(c, level) {
  const L = Math.max(0, Math.floor(level));
  const a = Math.min(L, c.softAt);
  const b = Math.max(0, L - c.softAt);
  return c.base * Math.pow(c.growth, a) * Math.pow(c.growth2, b);
}

/**
 * cost(kind, level, opt) -> number of the kind's currency needed to go from `level` to level + 1.
 *   kinds: cat_level, card_level, building_level, unlock_slot, crate
 *   opt.rarity multiplies cat_level and card_level (see RARITY_COST_MULT)
 *   crate: pass the crate id as `level` (cost('crate', 'neon_crate')) or as opt.id.
 *          opt.opens applies the price creep.
 * Returns Infinity when level is at the kind's maxLevel (nothing left to buy).
 */
export function cost(kind, level, opt = {}) {
  if (kind === 'crate') {
    const id = typeof level === 'string' ? level : opt.id;
    return crateCost(id, opt.opens || 0).price;
  }
  const c = CURVES[kind];
  if (!c) throw new Error('economy.cost: unknown kind ' + kind);
  if (level >= c.maxLevel) return Infinity;
  let v = geometric(c, level);
  if (kind === 'cat_level' || kind === 'card_level') v *= RARITY_COST_MULT[opt.rarity || 'common'] || 1;
  return Math.ceil(v);
}

/** Which currency a kind is paid in. */
export function costCurrency(kind, id) {
  if (kind === 'crate') return crateCost(id, 0).cur;
  const c = CURVES[kind];
  if (!c) throw new Error('economy.costCurrency: unknown kind ' + kind);
  return c.cur;
}

export function maxLevel(kind) { return CURVES[kind].maxLevel; }

export function crateCost(id, opens = 0) {
  let e = CRATE_PRICES[id];
  if (!e) {
    const order = Object.keys(CRATE_PRICES);
    const i = order.indexOf(id);
    e = i >= 0 ? CRATE_PRICES[order[i]] : CRATE_FALLBACK[0];
  }
  const creep = Math.min(CRATE_CREEP_CAP, 1 + CRATE_CREEP * Math.max(0, opens));
  return { cur: e.cur, price: Math.ceil(e.price * creep) };
}

/** Total cost to climb from level `from` to level `to` (sum of single steps). */
export function costRange(kind, from, to, opt = {}) {
  let s = 0;
  for (let l = from; l < to; l++) s += cost(kind, l, opt);
  return s;
}

/** Highest level reachable from `from` with `budget` (greedy, no overflow). */
export function levelsAffordable(kind, from, budget, opt = {}) {
  let l = from, b = budget;
  for (;;) {
    const c = cost(kind, l, opt);
    if (!(c <= b)) break;
    b -= c; l++;
  }
  return { level: l, spent: budget - b, left: b };
}

// ---------------------------------------------------------- stat multipliers

/** Milestone doubling: x2 at levels 25, 50, 75, 100 (classic idle milestone). */
export function milestoneMult(level) { return Math.pow(2, Math.floor(Math.max(0, level) / 25)); }

/** Optional power multiplier for a cat or card at `level` (level 1 = 1.0). */
export function levelMult(level) {
  const L = Math.max(1, level);
  return (1 + 0.1 * (L - 1)) * milestoneMult(L);
}

/** Star multiplier for cats: each star +25% (additive inside), diminishing past 5. */
export function starMult(stars) {
  const s = Math.max(0, stars | 0);
  return 1 + 0.25 * Math.min(s, 5) + 0.1 * Math.max(0, s - 5);
}

// ------------------------------------------------------------- stage rewards

/**
 * Raw reward for winning global stage gs, before multipliers.
 * opts: {firstClear:bool, replay:bool}. Boss stages (gs % 10 === 0) pay x3 fish, x2 yarn.
 */
export function stageReward(gs, opts = {}) {
  const g = Math.max(1, Math.floor(gs));
  const boss = g % 10 === 0;
  let fish = REWARD.fish.base * Math.pow(REWARD.fish.growth, g - 1) * (boss ? 3 : 1);
  let yarn = REWARD.yarn.base * Math.pow(REWARD.yarn.growth, g - 1) * (boss ? 2 : 1);
  if (opts.firstClear) { fish *= REWARD.firstClearBonus; yarn *= REWARD.firstClearBonus; }
  if (opts.replay && !opts.firstClear) { fish *= REWARD.repeatDecay; yarn *= REWARD.repeatDecay; }
  let gems = 0;
  if (boss && opts.firstClear) gems = REWARD.gemsBoss + Math.floor(g / STAGES_PER_DISTRICT) * REWARD.gemsBossPerDistrict;
  return { fish, yarn, gems, boss };
}

// --------------------------------------------------------- multiplier tiers

function countRelics(profile) { return profile.relics ? Object.keys(profile.relics).filter(k => profile.relics[k]).length : 0; }
function totalStars(profile) { let s = 0; for (const id in (profile.cats || {})) s += (profile.cats[id].stars | 0); return s; }
function townLevels(profile) {
  let s = 0; const pl = profile.town && profile.town.plots;
  if (pl) for (const p of pl) if (p && p.b) s += Math.max(0, (p.level | 0) - 1);
  return s;
}

/** Nine Lives permanent multipliers from total shards S. */
export function nineLivesMult(shards) {
  const S = Math.max(0, shards || 0);
  return {
    income: 1 + NINE_LIVES.incomeCoef * Math.pow(S, NINE_LIVES.incomeExp),
    damage: 1 + NINE_LIVES.damageCoef * Math.pow(S, NINE_LIVES.damageExp),
  };
}

/** Meta perk levels live in profile.meta (optional); missing means 0. */
export function metaLevel(profile, id) { return Math.max(0, (profile.meta && profile.meta[id]) | 0); }

export function metaCost(id, level) {
  const m = META[id];
  if (!m) throw new Error('economy.metaCost: unknown perk ' + id);
  if (level >= m.maxLevel) return Infinity;
  return Math.ceil(m.base * Math.pow(m.growth, level));
}

/**
 * Multiplier tiers for a profile. Inside a tier bonuses add; across tiers they multiply.
 *   tierRelics : 1 + softCap(sum of relic bonuses)
 *   tierCats   : 1 + softCap(sum of star bonuses)
 *   tierTown   : 1 + softCap(sum of building level bonuses)
 *   tierPrestige: Nine Lives income multiplier
 */
export function multipliers(profile) {
  const relic = softCap(countRelics(profile) * POOLS.relic.each, POOLS.relic.cap, POOLS.relic.exp);
  const star = softCap(totalStars(profile) * POOLS.star.each, POOLS.star.cap, POOLS.star.exp);
  const town = softCap(townLevels(profile) * POOLS.town.each, POOLS.town.cap, POOLS.town.exp);
  const nl = nineLivesMult(profile.nineLives && profile.nineLives.shards);
  return {
    relics: 1 + relic, cats: 1 + star, town: 1 + town,
    prestige: nl.income, damage: nl.damage,
    income: (1 + relic) * (1 + star) * (1 + town) * nl.income,
  };
}

// ------------------------------------------------------------------ town

/** Classify a building id into the resource it makes. Unknown ids make fish. */
export function buildingKind(id) {
  const s = String(id || '');
  if (/yarn|mill|loom|knit|wool/.test(s)) return 'yarn';
  return 'fish';
}

/** Passive output per second of one building at `level` (0 when level < 1). */
export function buildingOutput(buildingId, level) {
  const L = Math.floor(level);
  if (!(L >= 1)) return 0;
  return BUILDING_BASE[buildingKind(buildingId)] * L * Math.pow(BUILDING_LEVEL_GROWTH, L - 1);
}

/** Passive town output per second {fish, yarn}, before multipliers. */
export function townOutput(profile) {
  const out = { fish: 0, yarn: 0 };
  const pl = profile.town && profile.town.plots;
  if (!pl) return out;
  for (const p of pl) {
    if (!p || !p.b) continue;
    out[buildingKind(p.b)] += buildingOutput(p.b, p.level);
  }
  return out;
}

// ------------------------------------------------------------------ income

/**
 * income(profile) -> everything the UI and the bots need about earning rates.
 *   passive   : {fish, yarn} per second from the town, multiplied
 *   battle    : {fish, yarn, gems} for one win at the current best stage (replay value)
 *   active    : per second while playing battles back to back (battle + passive)
 *   perHour   : active * 3600 (fish, yarn), gems per hour estimate
 *   mult      : the tier breakdown (see multipliers)
 */
export function income(profile) {
  const m = multipliers(profile);
  const t = townOutput(profile);
  const gs = bestGlobalStage(profile);
  const r = stageReward(gs, { replay: true });
  const passive = { fish: t.fish * m.income, yarn: t.yarn * m.income };
  const battle = { fish: r.fish * m.income, yarn: r.yarn * m.income, gems: 0 };
  const active = {
    fish: battle.fish / BATTLE_SECONDS + passive.fish,
    yarn: battle.yarn / BATTLE_SECONDS + passive.yarn,
  };
  const gemsPerHour = clamp(Math.floor(gs / 10) * 0.35 + 3, 3, 12);
  return {
    passive, battle, active, mult: m, gs,
    perHour: { fish: active.fish * 3600, yarn: active.yarn * 3600, gems: gemsPerHour },
  };
}

/** Seconds of storage the town holds before it stops producing (collect() uses this). */
export function townStorageSeconds(profile) {
  return TOWN_STORAGE_SECONDS + 3600 * metaLevel(profile, 'offline_cap');
}

// ----------------------------------------------------------------- offline

export function offlineCapSeconds(profile) {
  const lvl = Math.min(META.offline_cap.maxLevel, metaLevel(profile, 'offline_cap'));
  const h = Math.min(OFFLINE.maxCapHours, OFFLINE.baseCapHours + lvl * OFFLINE.capHoursPerLevel);
  return h * 3600;
}

export function offlineEfficiency(profile) {
  const lvl = Math.min(META.offline_eff.maxLevel, metaLevel(profile, 'offline_eff'));
  return Math.min(OFFLINE.maxEff, OFFLINE.baseEff + lvl * OFFLINE.effPerLevel);
}

/**
 * Effective seconds credited for `awaySeconds` away. Negative or NaN away time (clock skew,
 * tampering) is 0. The first fullEffHours count fully, later hours count tailMult.
 * Returns {seconds, capped, effSeconds}. effSeconds is what to multiply by active income.
 */
export function offlineSeconds(profile, awaySeconds) {
  const away = Number.isFinite(awaySeconds) ? Math.max(0, awaySeconds) : 0;
  const cap = offlineCapSeconds(profile);
  const secs = Math.min(away, cap);
  const full = OFFLINE.fullEffHours * 3600;
  const eff = Math.min(secs, full) + Math.max(0, secs - full) * OFFLINE.tailMult;
  return { seconds: secs, capped: away > cap, effSeconds: eff * offlineEfficiency(profile) };
}

/** Offline gain from economy alone: fish and yarn (never gems). */
export function offlineGainFor(profile, awaySeconds) {
  const o = offlineSeconds(profile, awaySeconds);
  const inc = income(profile);
  return {
    fish: money(inc.active.fish * o.effSeconds),
    yarn: money(inc.active.yarn * o.effSeconds),
    seconds: o.seconds, capped: o.capped,
  };
}

// --------------------------------------------------------------- Nine Lives

/** Shards earned by resetting now. Zero until best stage reaches NINE_LIVES.minStage. */
export function nineLivesShards(bestGs) {
  const g = Math.max(0, Math.floor(bestGs || 0));
  if (g < NINE_LIVES.minStage) return 0;
  return Math.floor(NINE_LIVES.shardCoef * Math.pow(g / NINE_LIVES.shardDiv, NINE_LIVES.shardExp));
}

export function canNineLives(profile) {
  const n = (profile.nineLives && profile.nineLives.count) | 0;
  return bestGlobalStage(profile) >= NINE_LIVES.minStage && n < NINE_LIVES.maxResets;
}

/** First stage that is NOT an echo clear after a reset (see NINE_LIVES.echoFraction). */
export function echoStage(prevBestGs) { return Math.floor(Math.max(0, prevBestGs || 0) * NINE_LIVES.echoFraction); }

/** Fish a run starts with after a reset (start_fish perk). */
export function startingFish(profile) {
  return Math.floor(200 * metaLevel(profile, 'start_fish') * Math.pow(1.35, metaLevel(profile, 'start_fish')));
}

// ------------------------------------------------------------ difficulty model
// Enemy power curve the economy assumes. progression.stageScaling should stay within +-20% of
// this so the pacing targets hold. power is relative to stage 1 = 1.
export function enemyPower(gs) {
  const g = Math.max(1, gs);
  return Math.pow(1.064, g - 1) * (1 + 0.012 * (g - 1));
}

// A deliberately simple, deterministic player model used to calibrate TARGETS and by the bots'
// sanity checks. The player has `cats` equally levelled cats and a shared pool of yarn; power is
// cats * levelMult(L) * relic/prestige mults. A stage is won when power >= enemyPower * K.
const MODEL = { K: 1.5, cats: 4, battleSeconds: BATTLE_SECONDS, retryPenalty: 2, avgRarity: 'rare' };

/**
 * modelRun(seconds, {shards, startStage}) -> {stage, level, buildLevel, t}. Engaged player,
 * continuous play. Returns the global stage reached after `seconds` of play. Fish go into two
 * buildings (a fish stand and a yarn mill, alternating), yarn goes into the team's level.
 */
export function modelRun(seconds, opt = {}) {
  const nl = nineLivesMult(opt.shards || 0);
  let level = 1, yarn = 0, fish = (opt.startFish || 0), t = 0, gs = Math.max(1, opt.startStage || 1);
  let nFish = 0, nYarn = 0, rateFish = 0, rateYarn = 0, best = 0;
  const power = () => MODEL.cats * levelMult(level) * nl.damage * (1 + 0.03 * (nFish + nYarn));
  while (t < seconds) {
    const win = (gs < (opt.fastBelow || 0)) || power() >= enemyPower(gs) * MODEL.K;
    const r = stageReward(gs, { firstClear: win && gs > best && !(gs < (opt.fastBelow || 0)), replay: !win || gs < (opt.fastBelow || 0) });
    const echo = gs < (opt.fastBelow || 0);
    const dur = echo ? NINE_LIVES.echoSeconds : win ? MODEL.battleSeconds : MODEL.battleSeconds * MODEL.retryPenalty;
    const q = win ? 1 : 0.25;
    fish += (r.fish * q + rateFish * dur) * nl.income;
    yarn += (r.yarn * q + rateYarn * dur) * nl.income;
    t += dur;
    if (win) { best = Math.max(best, gs); gs++; }
    for (let guard = 0; guard < 200; guard++) {
      const bf = cost('building_level', nFish), by = cost('building_level', nYarn + 2);
      if (nFish <= nYarn + 2 && nFish < 80 && fish >= bf) {
        fish -= bf; nFish++; rateFish += buildingOutput('fish_stand', nFish) - buildingOutput('fish_stand', nFish - 1); continue;
      }
      if (nYarn < 80 && fish >= by) {
        fish -= by; nYarn++; rateYarn += buildingOutput('yarn_mill', nYarn) - buildingOutput('yarn_mill', nYarn - 1); continue;
      }
      const teamCost = cost('cat_level', level, { rarity: MODEL.avgRarity }) * MODEL.cats * 0.5;
      if (level < maxLevel('cat_level') && yarn >= teamCost) { yarn -= teamCost; level++; continue; }
      break;
    }
  }
  return { stage: gs, level, buildLevel: nFish + nYarn, t };
}

/**
 * modelCampaign(seconds) -> {stage, best, resets, shards, resetAt:[seconds]}. The same engaged
 * player, who resets (Nine Lives) as soon as an extra hour of play would add fewer than 2 stages.
 * Used to calibrate the 1 day and 1 week targets and the first Nine Lives timing.
 */
export function modelCampaign(seconds) {
  let shards = 0, elapsed = 0, best = 0, fastBelow = 0;
  const resetAt = [];
  while (resetAt.length < 60) {
    let T = 3600;
    const cap = seconds - elapsed;
    while (T < cap) {
      const a = modelRun(T, { shards, fastBelow }), b = modelRun(T + 3600, { shards, fastBelow });
      if (b.stage - a.stage < 2 && nineLivesShards(a.stage) >= Math.max(5, shards * 0.3)) break;
      T += 3600;
    }
    if (T >= cap) break;
    const run = modelRun(T, { shards, fastBelow });
    best = Math.max(best, run.stage);
    shards += nineLivesShards(run.stage);
    fastBelow = Math.floor(run.stage * NINE_LIVES.echoFraction);
    elapsed += T;
    resetAt.push(elapsed);
  }
  const last = modelRun(Math.max(0, seconds - elapsed), { shards, fastBelow });
  return { stage: last.stage, best: Math.max(best, last.stage), resets: resetAt.length, shards, resetAt };
}

// -------------------------------------------------------------- validation

/** Quick invariants the tests can call. Returns an array of problems (empty is good). */
export function selfCheck() {
  const bad = [];
  for (const k of Object.keys(CURVES)) {
    let prev = 0;
    for (let l = 0; l < CURVES[k].maxLevel; l++) {
      const c = cost(k, l);
      if (!(c > prev) && !(k === 'unlock_slot' && c >= prev)) bad.push(k + ' not increasing at ' + l);
      if (!Number.isFinite(c)) bad.push(k + ' not finite at ' + l);
      prev = c;
    }
  }
  if (nineLivesShards(NINE_LIVES.minStage - 1) !== 0) bad.push('shards before min stage');
  if (!(nineLivesMult(10).income < nineLivesMult(100).income)) bad.push('prestige mult not monotonic');
  return bad;
}
