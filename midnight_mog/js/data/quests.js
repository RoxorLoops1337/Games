// Midnight Mog: goals that reward checking in. Pure data plus pure helpers (no DOM, no Date, no Math.random).
// Owner: town and meta designer. Four layers, all endless by formula:
//   1. daily quests   : 3 per day (easy, mid, hard) + a bonus for finishing all, seeded by the DAY INDEX the caller passes
//   2. weekly quests  : 4 per week, seeded by floor(dayIndex / 7)
//   3. achievements   : 10 families x 5 named tiers = 50 entries, then tiers keep coming forever (achievementAt)
//   4. cat collection : by role and rarity (reads cats.js, so new cats extend it) + an endless star gallery
// Rewards are specs; resolve with buildings.resolveReward(spec, perMinute). Saves hold only counters and flags.

import { makeRng } from '../rng.js';
import { CATS, CAT_ROLES, RARITIES } from './cats.js';
import { resolveReward, hash32, roman } from './buildings.js';

export { resolveReward };

// ------------------------------------------------------------------ metrics

// Counters live in profile.stats and are incremented by the sims. Derived metrics read the profile.
// COUNTER_KEYS is the list the sim authors must keep updated (missing means 0).
export const COUNTER_KEYS = [
  'battlesWon', 'bossKills', 'kills', 'cardsPlayed', 'spellsCast', 'summons', 'perfectWins', 'fastWins',
  'cratesOpened', 'collects', 'upgrades', 'catLevelUps', 'fishEarned',
];

function statN(p, k) { return Math.max(0, (p && p.stats && Number(p.stats[k])) || 0); }
function gstage(d, s) { return (Math.max(1, d | 0) - 1) * 30 + Math.max(1, s | 0); }
function bestStage(p) {
  const pr = p && p.progress;
  if (!pr) return 1;
  let best = gstage(pr.district, pr.stage);
  const b = pr.best || {};
  for (const k of Object.keys(b)) best = Math.max(best, gstage(Number(k), b[k]));
  return best;
}
function catsOwned(p) { return p && p.cats ? Object.keys(p.cats).length : 0; }
function catsMaxLevel(p) { let m = 0; for (const id in (p && p.cats) || {}) m = Math.max(m, (p.cats[id].level | 0)); return m; }
function totalStars(p) { let s = 0; for (const id in (p && p.cats) || {}) s += (p.cats[id].stars | 0); return s; }
function townLevelSum(p) { let s = 0; const pl = p && p.town && p.town.plots; if (pl) for (const x of pl) if (x && x.b) s += Math.max(0, x.level | 0); return s; }

export const METRICS = {
  battlesWon: { label: 'battles won', read: (p) => statN(p, 'battlesWon') },
  bossKills: { label: 'bosses defeated', read: (p) => statN(p, 'bossKills') },
  kills: { label: 'enemies defeated', read: (p) => statN(p, 'kills') },
  cardsPlayed: { label: 'cards played', read: (p) => statN(p, 'cardsPlayed') },
  spellsCast: { label: 'spells cast', read: (p) => statN(p, 'spellsCast') },
  summons: { label: 'cats summoned', read: (p) => statN(p, 'summons') },
  perfectWins: { label: 'flawless wins', read: (p) => statN(p, 'perfectWins') },
  fastWins: { label: 'wins under 60 seconds', read: (p) => statN(p, 'fastWins') },
  cratesOpened: { label: 'crates opened', read: (p) => statN(p, 'cratesOpened') },
  collects: { label: 'town collections', read: (p) => statN(p, 'collects') },
  upgrades: { label: 'building upgrades', read: (p) => statN(p, 'upgrades') },
  catLevelUps: { label: 'cat level ups', read: (p) => statN(p, 'catLevelUps') },
  fishEarned: { label: 'fish earned', read: (p) => statN(p, 'fishEarned') },
  // derived
  bestStage: { label: 'best stage', read: bestStage },
  catsOwned: { label: 'cats owned', read: catsOwned },
  catsMaxLevel: { label: 'highest cat level', read: catsMaxLevel },
  townLevels: { label: 'total building levels', read: townLevelSum },
  nineLives: { label: 'Nine Lives resets', read: (p) => Math.max(0, (p && p.nineLives && p.nineLives.count) | 0) },
  totalStars: { label: 'cat stars', read: totalStars },
};

export function readMetric(profile, id) {
  const m = METRICS[id];
  return m ? m.read(profile) : 0;
}

// ------------------------------------------------------------- number helpers

/** Round to 2 significant digits (and integers below 10). */
export function niceNumber(x) {
  const v = Math.max(1, x);
  if (v < 10) return Math.round(v);
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

const fmt = (text, n) => text.replace('{n}', n >= 10000 ? n.toLocaleString('en-US') : String(n));

// ------------------------------------------------------- daily and weekly

// base: target at best stage 0. growth: extra target per log2(1 + stage / 20). unit: scale type.
// money: target is "minutes of active income", resolved with ctx.perMinute (sim: economy.income).
const DAILY = [
  { id: 'win_battles', cls: 'easy', metric: 'battlesWon', base: 3, growth: 0.5, text: 'Win {n} battles' },
  { id: 'defeat_enemies', cls: 'easy', metric: 'kills', base: 60, growth: 0.8, text: 'Defeat {n} enemies' },
  { id: 'play_cards', cls: 'easy', metric: 'cardsPlayed', base: 40, growth: 0.6, text: 'Play {n} cards' },
  { id: 'collect_town', cls: 'easy', metric: 'collects', base: 2, growth: 0.15, text: 'Collect from the town {n} times' },
  { id: 'open_crate', cls: 'easy', metric: 'cratesOpened', base: 1, growth: 0.2, text: 'Open {n} crates' },
  { id: 'flawless', cls: 'mid', metric: 'perfectWins', base: 2, growth: 0.3, text: 'Win {n} battles without losing base hp' },
  { id: 'cast_spells', cls: 'mid', metric: 'spellsCast', base: 12, growth: 0.6, text: 'Cast {n} spells' },
  { id: 'upgrade_town', cls: 'mid', metric: 'upgrades', base: 2, growth: 0.3, text: 'Upgrade buildings {n} times' },
  { id: 'train_cats', cls: 'mid', metric: 'catLevelUps', base: 4, growth: 0.6, text: 'Level up cats {n} times' },
  { id: 'summon_cats', cls: 'mid', metric: 'summons', base: 25, growth: 0.7, text: 'Summon {n} cats' },
  { id: 'slay_boss', cls: 'hard', metric: 'bossKills', base: 1, growth: 0.1, text: 'Bosses defeated: {n}' },
  { id: 'speed_run', cls: 'hard', metric: 'fastWins', base: 2, growth: 0.2, text: 'Win {n} battles in under 60 seconds' },
  { id: 'push_stage', cls: 'hard', metric: 'bestStage', base: 2, growth: 0.1, text: 'Reach {n} new stages' },
  { id: 'earn_fish', cls: 'hard', metric: 'fishEarned', money: { cur: 'fish', minutes: 30 }, base: 5000, growth: 0, text: 'Earn {n} fish' },
];
const WEEKLY = [
  { id: 'w_win', cls: 'w1', metric: 'battlesWon', base: 30, growth: 0.5, text: 'Win {n} battles' },
  { id: 'w_kills', cls: 'w1', metric: 'kills', base: 1000, growth: 0.8, text: 'Defeat {n} enemies' },
  { id: 'w_spells', cls: 'w1', metric: 'spellsCast', base: 150, growth: 0.6, text: 'Cast {n} spells' },
  { id: 'w_collect', cls: 'w2', metric: 'collects', base: 14, growth: 0.15, text: 'Collect from the town {n} times' },
  { id: 'w_crates', cls: 'w2', metric: 'cratesOpened', base: 8, growth: 0.3, text: 'Open {n} crates' },
  { id: 'w_upgrade', cls: 'w2', metric: 'upgrades', base: 15, growth: 0.3, text: 'Upgrade buildings {n} times' },
  { id: 'w_train', cls: 'w3', metric: 'catLevelUps', base: 30, growth: 0.6, text: 'Level up cats {n} times' },
  { id: 'w_flawless', cls: 'w3', metric: 'perfectWins', base: 12, growth: 0.3, text: 'Win {n} flawless battles' },
  { id: 'w_boss', cls: 'w4', metric: 'bossKills', base: 5, growth: 0.15, text: 'Bosses defeated: {n}' },
  { id: 'w_push', cls: 'w4', metric: 'bestStage', base: 6, growth: 0.15, text: 'Reach {n} new stages' },
  { id: 'w_fish', cls: 'w4', metric: 'fishEarned', money: { cur: 'fish', minutes: 480 }, base: 50000, growth: 0, text: 'Earn {n} fish' },
];
export const DAILY_TEMPLATES = DAILY;
export const WEEKLY_TEMPLATES = WEEKLY;

export const DAILY_REWARDS = {
  easy: { fish: { minutes: 15 }, gems: 2 },
  mid: { yarn: { minutes: 15 }, gems: 3 },
  hard: { fish: { minutes: 25 }, yarn: { minutes: 15 }, gems: 4 },
};
export const DAILY_BONUS = { gems: 3, keys: { alley_crate: 1 } };
export const WEEKLY_REWARDS = {
  w1: { fish: { minutes: 90 }, gems: 8 },
  w2: { yarn: { minutes: 90 }, gems: 10, keys: { alley_crate: 1 } },
  w3: { fish: { minutes: 120 }, yarn: { minutes: 60 }, gems: 12 },
  w4: { fish: { minutes: 180 }, gems: 15, keys: { neon_crate: 1 } },
};
export const WEEKLY_BONUS = { gems: 20, keys: { neon_crate: 1 }, tokens: 1 };
export const DAYS_PER_WEEK = 7;

/** Target of a template for a player whose best global stage is `stage`. ctx.perMinute = {fish, yarn} for money templates. */
export function questTarget(tpl, stage, perMinute) {
  if (tpl.money) {
    const per = perMinute && perMinute[tpl.money.cur];
    return niceNumber(per > 0 ? per * tpl.money.minutes : tpl.base);
  }
  const mult = 1 + tpl.growth * Math.log2(1 + Math.max(0, stage) / 20);
  return Math.max(1, Math.ceil(tpl.base * mult));
}

function pickOne(rng, list, used) {
  const free = list.filter((t) => !used.has(t.metric));
  const pool = free.length ? free : list;
  const t = pool[Math.floor(rng.next() * pool.length)];
  used.add(t.metric);
  return t;
}

function makeQuest(prefix, i, tpl, reward, profile, ctx) {
  const stage = bestStage(profile);
  const target = questTarget(tpl, stage, ctx && ctx.perMinute);
  return {
    id: prefix + '_' + i, tpl: tpl.id, metric: tpl.metric, text: fmt(tpl.text, target),
    target, base: readMetric(profile, tpl.metric), reward, claimed: false,
  };
}

/** Roll the 3 daily quests for a day index. Same (dayIndex, profile.seed) always gives the same templates. */
export function rollDaily(dayIndex, profile, ctx = {}) {
  const rng = makeRng(hash32('daily', profile && profile.seed, dayIndex));
  const used = new Set();
  const quests = ['easy', 'mid', 'hard'].map((cls, i) => {
    const tpl = pickOne(rng, DAILY.filter((t) => t.cls === cls), used);
    return makeQuest('d' + dayIndex, i, tpl, DAILY_REWARDS[cls], profile, ctx);
  });
  return { day: dayIndex, quests, bonus: { reward: DAILY_BONUS, claimed: false } };
}

/** Roll the 4 weekly quests for a week index (floor(dayIndex / 7)). */
export function rollWeekly(weekIndex, profile, ctx = {}) {
  const rng = makeRng(hash32('weekly', profile && profile.seed, weekIndex));
  const used = new Set();
  const quests = ['w1', 'w2', 'w3', 'w4'].map((cls, i) => {
    const tpl = pickOne(rng, WEEKLY.filter((t) => t.cls === cls), used);
    return makeQuest('w' + weekIndex, i, tpl, WEEKLY_REWARDS[cls], profile, ctx);
  });
  return { week: weekIndex, quests, bonus: { reward: WEEKLY_BONUS, claimed: false } };
}

/** A fresh quests state. profile.quests shape: see newQuestState. */
export function newQuestState() { return { v: 1, daily: null, weekly: null, ach: {}, col: {} }; }

/**
 * Bring a quests state up to dayIndex: rolls new dailies on a new day and new weeklies on a new week.
 * Returns a new object, never mutates. Old unclaimed quests are dropped on rollover (that is the point of checking in).
 */
export function refreshQuests(q, dayIndex, profile, ctx = {}) {
  const s = q ? { ...q } : newQuestState();
  if (!s.ach) s.ach = {};
  if (!s.col) s.col = {};
  if (dayIndex < 0 || !Number.isFinite(dayIndex)) return s;
  if (!s.daily || s.daily.day !== dayIndex) s.daily = rollDaily(dayIndex, profile, ctx);
  const wk = Math.floor(dayIndex / DAYS_PER_WEEK);
  if (!s.weekly || s.weekly.week !== wk) s.weekly = rollWeekly(wk, profile, ctx);
  return s;
}

/** progress 0..target for one quest instance. */
export function questProgress(inst, profile) {
  return Math.max(0, Math.min(inst.target, readMetric(profile, inst.metric) - inst.base));
}
export function questDone(inst, profile) { return questProgress(inst, profile) >= inst.target; }
/** True when every quest of a block (daily or weekly) is claimed, so the bonus can be claimed. */
export function bonusReady(block) { return block.quests.every((x) => x.claimed) && !block.bonus.claimed; }

// ------------------------------------------------------------- achievements

// 10 families x 5 named tiers = 50 entries, endless after that. target(n) = niceNumber(base * growth^n), strictly rising.
export const ACHIEVEMENT_FAMILIES = [
  { id: 'battles_won', metric: 'battlesWon', base: 10, growth: 2.6, text: 'Win {n} battles',
    names: ['Rookie Scrapper', 'Rooftop Regular', 'Alley Veteran', 'Neon Warrior', 'Midnight Legend'] },
  { id: 'stage_reached', metric: 'bestStage', base: 6, growth: 2.1, text: 'Reach stage {n}',
    names: ['First Steps', 'Skyline Walker', 'City Crosser', 'Endless Wanderer', 'Edge of Night'] },
  { id: 'bosses_beaten', metric: 'bossKills', base: 1, growth: 2.6, text: 'Bosses defeated: {n}',
    names: ['Crown Snatcher', 'Giant Tripper', 'Boss Bane', 'Tyrant Tamer', 'Throne Breaker'] },
  { id: 'enemies_defeated', metric: 'kills', base: 100, growth: 3.5, text: 'Defeat {n} enemies',
    names: ['Pest Control', 'Exterminator', 'Swarm Sweeper', 'Horde Hunter', 'Apocalypse Mouser'] },
  { id: 'crates_opened', metric: 'cratesOpened', base: 5, growth: 2.5, text: 'Open {n} crates',
    names: ['Box Sniffer', 'Tin Popper', 'Chest Cracker', 'Vault Cracker', 'Treasure Dragon'] },
  { id: 'cats_owned', metric: 'catsOwned', base: 3, growth: 1.6, text: 'Own {n} different cats',
    names: ['Stray Magnet', 'Cat Lady Apprentice', 'Clowder Keeper', 'Colony Queen', 'Cat of Cats'] },
  { id: 'cat_level', metric: 'catsMaxLevel', base: 5, growth: 1.9, text: 'Raise a cat to level {n}',
    names: ['Quick Study', 'Sharp Claws', 'Seasoned Scrapper', 'Master Mouser', 'Living Legend'] },
  { id: 'town_levels', metric: 'townLevels', base: 5, growth: 2.2, text: 'Reach {n} total building levels',
    names: ['Roofer', 'Block Builder', 'Skyline Architect', 'Neon Mayor', 'Rooftop Tycoon'] },
  { id: 'nine_lives', metric: 'nineLives', base: 1, growth: 1.9, text: 'Use Nine Lives {n} times',
    names: ['Second Wind', 'Third Chance', 'Cat Cradle', 'Lives Well Spent', 'Ninth Heaven'] },
  { id: 'fish_earned', metric: 'fishEarned', base: 1000, growth: 6, text: 'Earn {n} fish in total',
    names: ['Pocket Change', 'Fishmonger', 'Tuna Baron', 'Sea of Silver', 'Fish Singularity'] },
];
export const ACHIEVEMENT_BY_FAMILY = Object.fromEntries(ACHIEVEMENT_FAMILIES.map((f) => [f.id, f]));
export const NAMED_TIERS = 5;

const targetCache = new Map();
/** Target of tier n (0 based) of a family, forever. Strictly increasing. */
export function achievementTarget(fam, n) {
  let arr = targetCache.get(fam.id);
  if (!arr) { arr = []; targetCache.set(fam.id, arr); }
  while (arr.length <= n) {
    const i = arr.length;
    // named tiers use the family growth, later tiers soften to at most x1.8 per tier so the ladder stays reachable
    let v = i < NAMED_TIERS ? niceNumber(Math.min(1e15, fam.base * Math.pow(fam.growth, i)))
      : niceNumber(Math.min(1e15, arr[NAMED_TIERS - 1] * Math.pow(Math.min(fam.growth, 1.8), i - NAMED_TIERS + 1)));
    if (i > 0 && v <= arr[i - 1]) v = arr[i - 1] + (arr[i - 1] >= 10 ? Math.max(1, Math.round(arr[i - 1] * 0.1)) : 1);
    arr.push(v);
  }
  return arr[n];
}

/** Reward of tier n (0 based), same for every family. Gems rise by 2 per tier; keys every third tier; a token every fifth. */
export function achievementReward(n) {
  const r = { gems: 3 + 2 * n, fish: { minutes: 10 * (n + 1) } };
  if (n % 3 === 2) {
    const crate = n < 6 ? 'alley_crate' : n < 15 ? 'neon_crate' : n < 30 ? 'rooftop_crate' : 'midnight_crate';
    r.keys = { [crate]: 1 };
  }
  if (n % 5 === 4) r.tokens = 1 + Math.floor(n / 10);
  return r;
}

/** Entry n (0 based) of a family, for any n. id is `${family}_${n + 1}` (append-only, saves use the claimed count). */
export function achievementAt(familyId, n) {
  const fam = ACHIEVEMENT_BY_FAMILY[familyId];
  if (!fam) throw new Error('quests.achievementAt: unknown family ' + familyId);
  const target = achievementTarget(fam, n);
  const name = n < NAMED_TIERS ? fam.names[n] : fam.names[NAMED_TIERS - 1] + ' ' + roman(n - NAMED_TIERS + 2);
  return { id: fam.id + '_' + (n + 1), family: fam.id, tier: n, name, metric: fam.metric, target, text: fmt(fam.text, target), reward: achievementReward(n) };
}

/** The first 50 entries, tier-major (every family's tier 1, then every tier 2, ...). */
export const ACHIEVEMENTS = [];
for (let n = 0; n < NAMED_TIERS; n++) for (const f of ACHIEVEMENT_FAMILIES) ACHIEVEMENTS.push(achievementAt(f.id, n));

/**
 * Status of every family. quests.ach[familyId] = number of tiers claimed.
 * Returns [{family, claimed, value, next: entry, ready: tiers satisfied but not claimed}].
 */
export function achievementStatus(profile, quests) {
  const ach = (quests && quests.ach) || {};
  return ACHIEVEMENT_FAMILIES.map((f) => {
    const claimed = Math.max(0, ach[f.id] | 0);
    const value = readMetric(profile, f.metric);
    let ready = 0;
    while (ready < 200 && value >= achievementTarget(f, claimed + ready)) ready++;
    return { family: f.id, claimed, value, ready, next: achievementAt(f.id, claimed) };
  });
}

// --------------------------------------------------------- cat collection

export const COLLECTION_PCTS = [0.25, 0.5, 0.75, 1];
const ROLE_OWN_REWARD = [{ gems: 3 }, { gems: 5 }, { gems: 8 }, { gems: 15, keys: { neon_crate: 1 } }];
const RARITY_ALL_GEMS = { common: 5, rare: 10, epic: 20, legend: 40, mythic: 80 };
export const TRAINED_LEVEL = 10;
export const STARRED = 1;

function byRole(role) { return CATS.filter((c) => c.role === role); }
function byRarity(r) { return CATS.filter((c) => c.rarity === r); }

/** Star gallery tier n (0 based), forever: total cat stars needed 3 * 1.7^n (nice rounded, rising). */
export function starGalleryAt(n) {
  let prev = 0, v = 0;
  for (let i = 0; i <= n; i++) { v = niceNumber(Math.min(1e15, 3 * Math.pow(1.7, i))); if (v <= prev) v = prev + 1; prev = v; }
  return { id: 'col_stars_' + (n + 1), group: 'stars', label: 'Reach ' + v + ' total cat stars', need: v, reward: { gems: 3 + 2 * n, ...(n % 4 === 3 ? { keys: { rooftop_crate: 1 } } : {}) } };
}

/**
 * Every collection entry with progress: [{id, group:'role'|'rarity'|'stars', label, have, need, done, claimed, reward}].
 * quests.col[id] = true once claimed. The star gallery lists claimed tiers plus the next 3 (it never ends).
 */
export function collectionStatus(profile, quests) {
  const col = (quests && quests.col) || {};
  const cats = (profile && profile.cats) || {};
  const out = [];
  const add = (e) => { e.done = e.have >= e.need; e.claimed = !!col[e.id]; out.push(e); };
  for (const role of CAT_ROLES) {
    const list = byRole(role);
    if (!list.length) continue;
    const owned = list.filter((c) => cats[c.id]).length;
    COLLECTION_PCTS.forEach((pct, i) => {
      add({ id: `col_role_${role}_${Math.round(pct * 100)}`, group: 'role', role, label: `Own ${Math.round(pct * 100)}% of the ${role}s`, have: owned, need: Math.ceil(pct * list.length), reward: ROLE_OWN_REWARD[i] });
    });
    const trained = list.filter((c) => cats[c.id] && (cats[c.id].level | 0) >= TRAINED_LEVEL).length;
    add({ id: `col_role_${role}_trained`, group: 'role', role, label: `Train every ${role} to level ${TRAINED_LEVEL}`, have: trained, need: list.length, reward: { gems: 12, tokens: 1 } });
  }
  for (const r of RARITIES) {
    const list = byRarity(r);
    if (!list.length) continue;
    const owned = list.filter((c) => cats[c.id]).length;
    add({ id: `col_rarity_${r}_all`, group: 'rarity', rarity: r, label: `Own every ${r} cat`, have: owned, need: list.length, reward: { gems: RARITY_ALL_GEMS[r], ...(r === 'legend' || r === 'mythic' ? { keys: { midnight_crate: 1 } } : {}) } });
    const starred = list.filter((c) => cats[c.id] && (cats[c.id].stars | 0) >= STARRED).length;
    add({ id: `col_rarity_${r}_starred`, group: 'rarity', rarity: r, label: `Give every ${r} cat a star`, have: starred, need: list.length, reward: { gems: Math.ceil(RARITY_ALL_GEMS[r] * 0.6) } });
  }
  const stars = totalStars(profile);
  let claimedTiers = 0;
  while (claimedTiers < 500 && col[starGalleryAt(claimedTiers).id]) claimedTiers++;
  for (let n = 0; n < claimedTiers + 3; n++) { const s = starGalleryAt(n); add({ ...s, have: stars }); }
  return out;
}

/** Share of all cats owned, 0..1. */
export function collectionPct(profile) {
  const cats = (profile && profile.cats) || {};
  return CATS.length ? CATS.filter((c) => cats[c.id]).length / CATS.length : 0;
}

/**
 * Permanent battle effects earned by finishing sets (no claim needed, they are always on once the set is met).
 * Returns effect objects in the stat_mod vocabulary of validate.js: role set x1.04 dmg, role trained x1.04 hp,
 * rarity set x1.03 dmg (x1.05 for legend and mythic).
 */
export function collectionBonuses(profile) {
  const cats = (profile && profile.cats) || {};
  const out = [];
  for (const role of CAT_ROLES) {
    const list = byRole(role);
    if (!list.length) continue;
    if (list.every((c) => cats[c.id])) out.push({ id: `col_role_${role}_set`, effect: { kind: 'stat_mod', scope: 'role:' + role, stat: 'dmg', mult: 1.04 } });
    if (list.every((c) => cats[c.id] && (cats[c.id].level | 0) >= TRAINED_LEVEL)) out.push({ id: `col_role_${role}_trained_set`, effect: { kind: 'stat_mod', scope: 'role:' + role, stat: 'hp', mult: 1.04 } });
  }
  for (const r of RARITIES) {
    const list = byRarity(r);
    if (list.length && list.every((c) => cats[c.id])) out.push({ id: `col_rarity_${r}_set`, effect: { kind: 'stat_mod', scope: 'rarity:' + r, stat: 'dmg', mult: r === 'legend' || r === 'mythic' ? 1.05 : 1.03 } });
  }
  return out;
}

// --------------------------------------------------------------- self check

export function validateQuests() {
  const bad = [];
  const seen = new Set();
  for (const t of [...DAILY, ...WEEKLY]) {
    if (seen.has(t.id)) bad.push('dup template ' + t.id);
    seen.add(t.id);
    if (!METRICS[t.metric]) bad.push(t.id + ' unknown metric ' + t.metric);
  }
  for (const f of ACHIEVEMENT_FAMILIES) {
    if (!METRICS[f.metric]) bad.push(f.id + ' unknown metric');
    if (f.names.length !== NAMED_TIERS) bad.push(f.id + ' needs ' + NAMED_TIERS + ' names');
    for (let n = 1; n < 60; n++) if (!(achievementTarget(f, n) > achievementTarget(f, n - 1))) bad.push(f.id + ' not rising at ' + n);
  }
  if (ACHIEVEMENTS.length !== 50) bad.push('expected 50 achievements, got ' + ACHIEVEMENTS.length);
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  if (ids.size !== ACHIEVEMENTS.length) bad.push('achievement ids not unique');
  for (const k of COUNTER_KEYS) if (!(k in METRICS)) bad.push('counter without metric ' + k);
  return bad;
}
