// Progression: stage scaling, wave schedules, bosses, endless mode, rewards, unlocks and Nine Lives.
// Deterministic and pure: no DOM, no Math.random, no Date. Functions return new objects and never mutate the profile.
//
// STAGE NUMBERING (read this once):
//   * "gs" is the global stage index, 1 based, forever. It is the unit of economy.enemyPower, economy.stageReward,
//     the boss rhythm (gs % 10 === 0) and districts.districtForStage (6 named districts for gs 1..60, then the endless
//     "Comet Rift" loop that replays them every 60 stages).
//   * The profile stores progress as {district, stage} with economy.STAGES_PER_DISTRICT (30) stages per district, so
//     gs = economy.globalStage(district, stage). Every function here that takes (district, stage) accepts:
//       - a number district (profile encoding, 30 per district) -> gs = globalStage(district, stage)
//       - a district id string such as 'alley_alamo' (content encoding, stage 1..10 inside it)
//       - null/undefined district -> `stage` is already a gs
import { makeRng } from '../rng.js';
import { DISTRICTS, DISTRICT_BY_ID, ENDLESS, ELITE_AFFIXES, districtForStage, waveCount } from '../data/districts.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { BUILDING_BY_ID, statsAt, adjacency, keptLevel, roman } from '../data/buildings.js';
import {
  STAGES_PER_DISTRICT, NINE_LIVES, MAX_CUR, globalStage, bestGlobalStage, stageReward, multipliers,
  enemyPower, nineLivesShards, canNineLives, echoStage, startingFish, money, clamp,
} from './economy.js';

export const LANES = 5;                          // default lane count for spawn schedules (override via opts.lanes)
export const ECHO_SECONDS = NINE_LIVES.echoSeconds;
export const MAX_GS = 3e7;                       // 1e6 districts x 30 stages: the largest stage profile.js keeps
export const BIG = 1e300;                        // all scaling factors are clamped here, so nothing becomes Infinity

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const capBig = (x) => (Number.isFinite(x) ? Math.min(x, BIG) : BIG);
const num = (x) => (Number.isFinite(x) ? x : 0);

// ------------------------------------------------------------------ stage numbers

/** gs -> profile encoding {district, stage} (both 1 based, 30 stages per district). */
export function fromGlobal(gs) {
  const g = Math.max(1, Math.floor(fin(gs, 1)));
  return { district: Math.floor((g - 1) / STAGES_PER_DISTRICT) + 1, stage: ((g - 1) % STAGES_PER_DISTRICT) + 1 };
}

/** Resolve (district, stage) to a global stage index. See the header for the three accepted encodings. */
export function toGlobal(district, stage) {
  if (district == null) return Math.max(1, Math.floor(fin(stage, 1)));
  if (typeof district === 'string') {
    const d = DISTRICT_BY_ID[district];
    if (!d) throw new Error('progression: unknown district ' + district);
    return (d.order - 1) * 10 + Math.max(1, Math.floor(fin(stage, 1)));
  }
  return globalStage(district, stage);
}

/** Content facts for a stage: {gs, district (data def), stageInDistrict, round, endless, isBoss, loopedStage, boss, label}. */
export function stageInfo(district, stage) {
  const gs = toGlobal(district, stage);
  const info = districtForStage(gs);
  const d = info.district;
  return {
    gs, district: d, stageInDistrict: info.stageInDistrict, round: info.round, endless: info.endless,
    isBoss: info.isBoss, loopedStage: info.loopedStage, boss: info.isBoss ? ENEMY_BY_ID[d.boss] : null,
    label: info.endless ? 'Comet Rift ' + roman(info.round + 1) + ': ' + d.name : d.name,
  };
}

/** Number of waves in a stage including the extra boss wave on boss stages. */
export function wavesPerStage(district, stage) {
  const gs = toGlobal(district, stage);
  return waveCount(gs) + (districtForStage(gs).isBoss ? 1 : 0);
}

// ------------------------------------------------------------------ scaling

/**
 * Enemy stat multipliers for a stage. Always within +-20% of economy.enemyPower(gs) on hp and dmg, so the pacing
 * targets in economy.TARGETS hold forever. Values are clamped to 1e300 (never Infinity, never NaN).
 * Returns {gs, hp, dmg, speed, reward, power, round, endless, boss}. `reward` multiplies per-kill fish
 * (it follows the stageReward growth), `speed` is a gentle monotonic ramp capped at 1.35.
 */
export function stageScaling(district, stage) {
  const gs = toGlobal(district, stage);
  const info = districtForStage(gs);
  const power = capBig(enemyPower(gs));
  const r = Math.min(info.round, 5);
  const hp = capBig(power * (1.06 + 0.02 * r));
  const dmg = capBig(power * (0.94 - 0.02 * r));
  const speed = Math.min(1.35, 1 + 0.0015 * (gs - 1));
  const reward = capBig(Math.pow(1.072, gs - 1));
  return { gs, hp, dmg, speed, reward, power, round: info.round, endless: info.endless, boss: info.isBoss };
}

// ------------------------------------------------------------------ waves

// Budget cost of one enemy "unit" (swarm members cost 0.5 each, see SYSTEMS 4).
function unitCost(e) {
  if (e.traits.includes('swarm')) return 0.5;
  let c = 1;
  if (e.traits.includes('armored')) c *= 1.3;
  if (e.traits.includes('shielded')) c *= 1.3;
  if (e.traits.includes('healer')) c *= 1.6;
  if (e.traits.includes('splitter')) c *= 1.6;
  if (e.traits.includes('burrower')) c *= 1.4;
  if (e.traits.includes('explosive')) c *= 1.2;
  if (e.traits.includes('ranged')) c *= 1.2;
  return c;
}

function groupOf(e) {
  const p = e.params && e.params.swarm;
  return p && p.group > 1 ? p.group : 1;
}

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** Wave point budget. Grows with the stage, the wave and the endless round; capped so counts stay playable. */
export function waveBudget(info, waveIdx) {
  const w = Math.max(0, waveIdx | 0);
  const b = (3 + 0.9 * info.stageInDistrict + 1.6 * Math.min(w, 14)) * (1 + 0.12 * Math.min(info.round, 15));
  return Math.min(90, b);
}

function poolFor(info) {
  const d = info.district;
  return d.enemyPool
    .filter((p) => info.endless || p.from <= info.stageInDistrict)
    .map((p) => ({ e: ENEMY_BY_ID[p.id], weight: p.weight }));
}

function guestPool(info) {
  const out = [];
  for (const d of DISTRICTS) {
    if (d.id === info.district.id) continue;
    for (const p of d.enemyPool) out.push({ e: ENEMY_BY_ID[p.id], weight: p.weight });
  }
  return out;
}

/**
 * Spawn schedule for one wave: [{t, enemyId, count, lane, affix, wave, boss?, phases?}] sorted by t (seconds from the
 * wave start). `affix` is null or a non-empty array of ELITE_AFFIXES ids (endless only; bosses there always get
 * ENDLESS.affixesByRound(round) of them). A swarm entry is one whole group (count = group size). The last wave of a
 * boss stage (waveIdx === waveCount) is the boss wave: the district boss plus an escort, `phases` copied from the
 * enemy def. Any waveIdx works (endless never runs out). Uses only `rng` (a default seeded from the arguments).
 * opts: {lanes}
 */
export function enemyWave(district, stage, waveIdx, rng, opts = {}) {
  const info = stageInfo(district, stage);
  const lanes = Math.max(1, opts.lanes | 0 || LANES);
  const w = Math.max(0, Math.floor(fin(waveIdx, 0)));
  const R = rng || makeRng(hashStr(info.district.id) ^ Math.imul(info.gs, 2654435761) ^ Math.imul(w + 1, 40503));
  const normalWaves = waveCount(info.gs);
  const isBossWave = info.isBoss && w >= normalWaves;
  const eliteP = info.endless ? ENDLESS.eliteChance(info.loopedStage) : 0;

  const pool = poolFor(info);
  const guests = info.endless && info.round >= 1 ? guestPool(info) : [];
  const used = {};
  const entries = [];
  let spent = 0;
  const budget = waveBudget(info, w) * (isBossWave ? 0.5 : 1);

  let guard = 0;
  while (spent < budget && entries.length < 80 && guard++ < 400) {
    let src = pool;
    if (guests.length && R.chance(0.2)) src = guests;
    // Variety: weight falls as the same enemy is reused in this wave.
    const pick = R.weighted(src, (p) => p.weight / (1 + 0.6 * (used[p.e.id] || 0)));
    const e = pick.e;
    used[e.id] = (used[e.id] || 0) + 1;
    const group = groupOf(e);
    let count, cost;
    if (group > 1) { count = group; cost = 0.5 * group; }
    else { count = e.traits.includes('swarm') ? R.int(2, 4) : R.int(1, 2); cost = unitCost(e) * count; }
    let affix = null;
    if (eliteP > 0 && group === 1 && R.chance(eliteP)) {
      count = 1; cost = unitCost(e) * 2.5;
      affix = [R.pick(ELITE_AFFIXES).id];
    }
    entries.push({ enemyId: e.id, count, lane: R.int(0, lanes - 1), affix });
    spent += cost;
  }

  const dur = Math.min(40, 16 + 1.5 * Math.min(w, 14)) + (isBossWave ? 14 : 0);
  const n = entries.length;
  const out = entries.map((en, i) => ({
    t: Math.round((0.5 + (i + R.next() * 0.8) * (dur / Math.max(1, n))) * 100) / 100,
    enemyId: en.enemyId, count: en.count, lane: en.lane, affix: en.affix, wave: w,
  }));

  if (isBossWave) {
    const boss = ENEMY_BY_ID[info.district.boss];
    const k = info.endless ? Math.min(ENDLESS.affixesByRound(info.round), ELITE_AFFIXES.length) : 0;
    const affix = k > 0 ? R.shuffle(ELITE_AFFIXES.map((a) => a.id)).slice(0, k) : null;
    out.push({
      t: 1, enemyId: boss.id, count: 1, lane: Math.floor(lanes / 2), affix, wave: w, boss: true,
      phases: boss.phases.map((p) => ({ ...p })),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Every wave of a stage, each from the same rng stream in order. Handy for tests and previews. */
export function stagePlan(district, stage, rng, opts = {}) {
  const n = wavesPerStage(district, stage);
  const out = [];
  for (let i = 0; i < n; i++) out.push(enemyWave(district, stage, i, rng, opts));
  return out;
}

// ------------------------------------------------------------------ town hooks

function townPlots(profile) { return (profile && profile.town && profile.town.plots) || []; }

/** Sum of a building stat over the town, using adjacency potency: e.g. townStat(p, 'battleFishPct'). */
export function townStat(profile, stat) {
  const plots = townPlots(profile);
  let v = 0;
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    const def = p && p.b ? BUILDING_BY_ID[p.b] : null;
    if (!def || !(p.level >= 1) || !def.effects.some((e) => e.stat === stat)) continue;
    v += num(statsAt(def, p.level, adjacency(plots, i).potency)[stat]);
  }
  return v;
}

/** {shardPct, echoAdd, keepAdd} from the Shrine to the Nine Lives (zeros when not built). */
export function shrineBonuses(profile) {
  return { shardPct: townStat(profile, 'shardPct'), echoAdd: townStat(profile, 'echoAdd'), keepAdd: townStat(profile, 'keepAdd') };
}

// ------------------------------------------------------------------ progress state

function frontierGs(profile) {
  const p = profile && profile.progress;
  return p ? globalStage(p.district, p.stage) : 1;
}

/** Highest stage cleared this life. Falls back to frontier - 1 for profiles that never stored it. */
export function maxCleared(profile) {
  const p = (profile && profile.progress) || {};
  return Math.max(p.maxCleared | 0, frontierGs(profile) - 1);
}

/** Stages below this global stage are echo clears (20 s, replay pay). 0 before the first Nine Lives. */
export function echoThreshold(profile) {
  return Math.max(0, ((profile && profile.progress && profile.progress.echo) | 0));
}

export function isEchoStage(profile, gs) { return gs < echoThreshold(profile); }

/** Can the player start this stage? Any cleared stage, or exactly the frontier. */
export function isStageUnlocked(profile, gs) { return gs >= 1 && gs <= Math.max(frontierGs(profile), maxCleared(profile) + 1); }

/**
 * How a battle at gs plays: {gs, echo, seconds (null for a normal battle), firstClear, replay}.
 * The UI skips the battle for echo stages and calls stageRewards with the same result.
 */
export function stageMode(profile, gs) {
  const echo = isEchoStage(profile, gs);
  const firstClear = !echo && gs > maxCleared(profile);
  return { gs, echo, seconds: echo ? ECHO_SECONDS : null, firstClear, replay: !firstClear };
}

// ------------------------------------------------------------------ districts

/** Number of profile districts (30 stages each) the player can enter. Never ends. */
export function unlockedDistricts(profile) {
  return fromGlobal(Math.max(bestGlobalStage(profile), frontierGs(profile))).district;
}

export function isDistrictUnlocked(profile, district) { return district >= 1 && district <= unlockedDistricts(profile); }

/** Named content district (rooftop_row ...) unlocked by id: its first stage must be reachable. Endless loop opens after 60. */
export function isContentDistrictUnlocked(profile, id) {
  const d = DISTRICT_BY_ID[id];
  if (!d) return false;
  return Math.max(bestGlobalStage(profile), frontierGs(profile)) >= d.stages[0];
}

export function unlockedContentDistricts(profile) {
  return DISTRICTS.filter((d) => isContentDistrictUnlocked(profile, d.id)).map((d) => d.id);
}

/** Endless (Comet Rift) is open once the last named stage is behind the player. */
export function endlessUnlocked(profile) { return maxCleared(profile) >= 60; }

// ------------------------------------------------------------------ rewards

function clone(o) { return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }

function ensure(p) {
  p.cur = p.cur || {};
  p.stats = p.stats || {};
  p.progress = p.progress || { district: 1, stage: 1, best: {} };
  p.progress.best = p.progress.best || {};
  return p;
}

function addCur(p, k, v) { p.cur[k] = Math.min(MAX_CUR, num(p.cur[k]) + v); }

/**
 * Apply a finished battle. result: {won, district, stage | gs, seconds?, kills?, perfect?, rewardMult?, noAdvance?}.
 *   gs/stage default to the profile frontier. rewardMult is for Observatory maps (they pass noAdvance too).
 * Returns {profile, rewards:{fish, yarn, gems}, won, gs, echo, firstClear, boss, advanced}. A loss pays nothing and
 * returns the profile unchanged. Echo stages pay the replay value and never gems. Fish and yarn include the income tier,
 * the Cannery-style battleFishPct and the Radio Tower battleYarnPct. Gems come from economy.stageReward, first clears only.
 */
export function stageRewards(profile, result = {}) {
  let gs = result.gs != null ? Math.max(1, Math.floor(result.gs))
    : (result.district != null || result.stage != null) ? toGlobal(result.district, result.stage) : frontierGs(profile);
  // a stage that is NaN or Infinity (a buggy caller) falls back to the frontier; the top is the largest stage a save can hold
  if (!Number.isFinite(gs)) gs = frontierGs(profile);
  gs = Number.isFinite(gs) ? Math.min(MAX_GS, Math.max(1, gs)) : 1;
  const mode = stageMode(profile, gs);
  const zero = { fish: 0, yarn: 0, gems: 0 };
  if (!result.won) return { profile, rewards: zero, won: false, gs, echo: mode.echo, firstClear: false, boss: gs % 10 === 0, advanced: false };

  const raw = stageReward(gs, { firstClear: mode.firstClear, replay: mode.replay });
  const m = multipliers(profile);
  const rm = result.rewardMult == null ? 1 : Math.max(0, num(result.rewardMult));
  const fish = money(Math.min(MAX_CUR, raw.fish * m.income * (1 + townStat(profile, 'battleFishPct')) * rm));
  const yarn = money(Math.min(MAX_CUR, raw.yarn * m.income * (1 + townStat(profile, 'battleYarnPct')) * rm));
  const gems = mode.firstClear && !mode.echo ? raw.gems : 0;

  const p = ensure(clone(profile));
  addCur(p, 'fish', fish); addCur(p, 'yarn', yarn); addCur(p, 'gems', gems);
  const s = p.stats;
  s.battlesWon = (s.battlesWon | 0) + 1;
  s.fishEarned = num(s.fishEarned) + fish;
  s.kills = (s.kills | 0) + Math.max(0, result.kills | 0);
  if (raw.boss) s.bossKills = (s.bossKills | 0) + 1;
  if (result.perfect) s.perfectWins = (s.perfectWins | 0) + 1;
  if (result.seconds != null && result.seconds < 60) s.fastWins = (s.fastWins | 0) + 1;

  let advanced = false;
  const front = frontierGs(profile);
  if (!result.noAdvance && gs >= front) {
    const nxt = fromGlobal(gs + 1);
    const cleared = fromGlobal(gs);
    p.progress.best[cleared.district] = Math.max(p.progress.best[cleared.district] | 0, cleared.stage);
    p.progress.district = nxt.district;
    p.progress.stage = nxt.stage;
    advanced = true;
  }
  if (!result.noAdvance) p.progress.maxCleared = Math.max(p.progress.maxCleared | 0, gs);
  return { profile: p, rewards: { fish, yarn, gems }, won: true, gs, echo: mode.echo, firstClear: mode.firstClear, boss: raw.boss, advanced };
}

/**
 * Resolve up to `maxStages` echo clears in a row from the frontier (20 s each in game time). Returns
 * {profile, cleared, seconds, rewards}. Stops at the echo threshold.
 */
export function echoClear(profile, maxStages = 5000) {   // bounded by default: a tampered echo threshold of 1e9 must not freeze the game
  let p = profile, cleared = 0;
  const rewards = { fish: 0, yarn: 0, gems: 0 };
  while (cleared < maxStages && isEchoStage(p, frontierGs(p))) {
    const r = stageRewards(p, { won: true });
    p = r.profile; cleared++;
    rewards.fish += r.rewards.fish; rewards.yarn += r.rewards.yarn;
    if (!r.advanced) break;
  }
  return { profile: p, cleared, seconds: cleared * ECHO_SECONDS, rewards };
}

// ------------------------------------------------------------------ Nine Lives

/** Preview what a reset would give: {allowed, best, shards, echo, shrine}. */
export function nineLivesPreview(profile) {
  const best = bestGlobalStage(profile);
  const shrine = shrineBonuses(profile);
  const allowed = canNineLives(profile);
  const shards = allowed ? Math.floor(nineLivesShards(best) * (1 + shrine.shardPct)) : 0;
  const echo = Math.max(echoStage(best), Math.floor(best * clamp(NINE_LIVES.echoFraction + shrine.echoAdd, 0, 0.95)));
  return { allowed, best, shards, echo, shrine };
}

/**
 * Nine Lives reset. Returns {profile, shards, ok}; when not allowed (best stage under 30) the profile is returned
 * untouched with shards 0 and ok false. Does not mutate the input.
 *  - shards = floor(economy.nineLivesShards(best) * (1 + shrine shardPct)); added to nineLives.shards (the permanent
 *    multiplier input, diminishing through economy.nineLivesMult) and to cur.tokens (1 token per shard).
 *  - Resets: progress (district 1, stage 1, best {}), fish (start_fish perk), yarn, cat and card levels (collection,
 *    dupes, stars, counts kept), stats.crateOpens (crate price creep), town.xp.
 *  - Keeps: gems, tokens, meta, relics, deck, pity, quests, plot count, town.keys, streak, visitor, mapsCleared, stats.
 *  - Buildings keep buildings.keptLevel(def, level, shrine keepAdd) of their level.
 *  - progress.echo = floor(best * (echoFraction + shrine echoAdd)): stages below it are echo clears (20 s).
 */
export function nineLivesReset(profile) {
  const pre = nineLivesPreview(profile);
  if (!pre.allowed) return { profile, shards: 0, ok: false };
  const p = ensure(clone(profile));
  const { shrine, best, shards, echo } = pre;

  const nl = p.nineLives = p.nineLives || { count: 0, shards: 0 };
  nl.count = (nl.count | 0) + 1;
  nl.shards = (nl.shards | 0) + shards;
  nl.lastBest = best;
  if (nl.count >= 9) nl.ascended = true;

  addCur(p, 'tokens', shards);
  p.cur.fish = money(startingFish(profile));
  p.cur.yarn = 0;

  for (const id of Object.keys(p.cats || {})) if (p.cats[id]) p.cats[id].level = 1;
  for (const id of Object.keys(p.cards || {})) if (p.cards[id]) p.cards[id].level = 1;
  p.stats.crateOpens = 0;

  if (p.town) {
    p.town.xp = 0;
    p.town.plots = (p.town.plots || []).map((pl) => {
      if (!pl || !pl.b) return pl;
      const def = BUILDING_BY_ID[pl.b];
      const level = def ? keptLevel(def, pl.level | 0, shrine.keepAdd) : 1;
      return { ...pl, level };
    });
  }

  p.progress = { district: 1, stage: 1, best: {}, maxCleared: 0, echo, prevBest: best };
  return { profile: p, shards, ok: true };
}
