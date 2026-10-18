// Midnight Mog: the player profile. New game, save, load, migration and repair.
// Pure and deterministic: no DOM, no Date, no Math.random, no localStorage. Time is passed in. Storage is passed in
// (anything with getItem/setItem/removeItem), so tests use a fake and the browser passes localStorage.
//
// Profile (v1):
//   { v, seed, createdAt, lastSeen, cur:{fish,gems,yarn,tokens}, cats:{[id]:{level,dupes,stars}}, deck:[cardId],
//     cards:{[id]:{level,count}}, relics:{[id]:true}, meta:{offline_cap,offline_eff,start_fish,crate_luck,extra_slot},
//     town:{plots:[{b,level,t,opt?,acc?}|{}], keys:{[crateId]:int}, xp, streak:{days,last}, visitor:{slot,claimed},
//           mapsCleared:{[mapId]:dayIndex}, keyFrac?},
//     progress:{district,stage,best:{[district]:stage}, maxCleared?, echo?, prevBest?},
//     nineLives:{count,shards,lastBest?,ascended?}, pity:{[crateId|crateId@tier]:int},
//     stats:{...COUNTER_KEYS, crateOpens, cratesTotal, gemDay, gemToday, ...other finite counters}, quests }
//
// Rules of the repair pass (sanitize): every output field is rebuilt from a whitelist, so unknown ids are dropped,
// missing keys come from defaults, numbers are finite and clamped, currencies are never negative.

import { CAT_BY_ID } from '../data/cats.js';
import { CARD_BY_ID, STARTER_DECK } from '../data/cards.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { CRATE_BY_ID, PITY_TIERS, MAX_STARS } from '../data/crates.js';
import { BUILDING_BY_ID, START_PLOTS, validateOpt } from '../data/buildings.js';
import { newQuestState, COUNTER_KEYS, METRICS, ACHIEVEMENT_FAMILIES } from '../data/quests.js';
import { MAX_CUR, META, REWARD, CURVES } from './economy.js';
import { DECK_BASE_SLOTS } from './deck.js';

export const PROFILE_VERSION = 1;
export const SAVE_KEY = 'midnight_mog_save_v1';
export const BACKUP_KEY = 'midnight_mog_save_v1_bak';

const CURRENCIES = ['fish', 'yarn', 'gems', 'tokens'];
const MAX_DECK_CARDS = 60;       // hard repair limit, far above DECK_BASE_SLOTS plus barracks
const MAX_PLOTS = 400;
const MAX_STAT = 1e18;
const MAX_TIME = 8.64e15;        // largest valid JS date in ms
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const NAME_RE = /^[a-z0-9_]{1,48}$/;
const MAX_FREE_KEYS = 64;

// Starting kit, tuned so the first crate (alley 400 fish) opens inside 2 minutes and three open before minute 5.
export const START = {
  cur: { fish: 1500, yarn: 300, gems: 10, tokens: 0 },
  cats: ['scrap_tabby', 'whisker_scout', 'spark_kit'],
  firstPlot: { b: 'tuna_cannery', level: 1 },
};

// ------------------------------------------------------------------ small helpers

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function fin(x, d = 0) { const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x; return typeof n === 'number' && Number.isFinite(n) ? n : d; }
function int(x, lo, hi, d = lo) { return Math.min(hi, Math.max(lo, Math.floor(fin(x, d)))); }
function safeKey(k) { return typeof k === 'string' && NAME_RE.test(k) && !BAD_KEYS.has(k); }
function entries(o) { return isObj(o) ? Object.keys(o) : []; }
function bool(x) { return x === true; }

// ------------------------------------------------------------------ new profile

/** Fresh profile. seed: uint32. nowMs is optional (the sim never reads a clock; the shell passes it). */
export function newProfile(seed = 1, nowMs = 0) {
  const now = int(nowMs, 0, MAX_TIME, 0);
  const cats = {};
  for (const id of START.cats) cats[id] = { level: 1, dupes: 0, stars: 0 };
  const cards = {};
  for (const id of STARTER_DECK) cards[id] = { level: 1, count: (cards[id] ? cards[id].count : 0) + 1 };
  const plots = [];
  for (let i = 0; i < START_PLOTS; i++) plots.push({});
  plots[0] = { b: START.firstPlot.b, level: START.firstPlot.level, t: now };
  const p = {
    v: PROFILE_VERSION,
    seed: int(seed, 0, 4294967295, 1),
    createdAt: now,
    lastSeen: now,
    cur: { ...START.cur },
    cats,
    deck: STARTER_DECK.slice(),
    cards,
    relics: {},
    meta: { offline_cap: 0, offline_eff: 0, start_fish: 0, crate_luck: 0, extra_slot: 0 },
    town: { plots, keys: {}, xp: 0, streak: { days: 0, last: -1 }, visitor: { slot: -1, claimed: false }, mapsCleared: {} },
    progress: { district: 1, stage: 1, best: {} },
    nineLives: { count: 0, shards: 0 },
    pity: {},
    stats: freshStats(),
    quests: newQuestState(),
  };
  return p;
}

function freshStats() {
  const s = {};
  for (const k of COUNTER_KEYS) s[k] = 0;
  s.crateOpens = 0; s.cratesTotal = 0; s.gemDay = -1; s.gemToday = 0;
  return s;
}

// ------------------------------------------------------------------ sanitize (the repair pass)

function sCur(src) {
  const out = {};
  const s = isObj(src) ? src : {};
  for (const k of CURRENCIES) out[k] = int(s[k], 0, MAX_CUR, START.cur[k]);
  return out;
}

function sCats(src) {
  const out = {};
  if (!isObj(src)) return out;
  for (const id of entries(src)) {
    if (!has(CAT_BY_ID, id) || !isObj(src[id])) continue;
    const e = src[id];
    out[id] = { level: int(e.level, 1, CURVES.cat_level.maxLevel, 1), dupes: int(e.dupes, 0, 1e9, 0), stars: int(e.stars, 0, MAX_STARS, 0) };
  }
  return out;
}

function sCards(src) {
  const out = {};
  if (!isObj(src)) return out;
  for (const id of entries(src)) {
    if (!has(CARD_BY_ID, id) || !isObj(src[id])) continue;
    const e = src[id];
    out[id] = { level: int(e.level, 1, CURVES.card_level.maxLevel, 1), count: int(e.count, 0, 1e9, 1) };
  }
  return out;
}

function sRelics(src) {
  const out = {};
  if (!isObj(src)) return out;
  for (const id of entries(src)) if (has(RELIC_BY_ID, id) && src[id]) out[id] = true;
  return out;
}

function sDeck(src, cards) {
  let deck = Array.isArray(src) ? src.filter((id) => typeof id === 'string' && has(CARD_BY_ID, id)) : [];
  if (deck.length > MAX_DECK_CARDS) deck = deck.slice(0, MAX_DECK_CARDS);
  if (deck.length < 4) deck = STARTER_DECK.slice();
  // every deck card must be owned, otherwise the deck screen could not show or level it
  for (const id of deck) if (!cards[id]) cards[id] = { level: 1, count: 1 };
  return deck;
}

function sMeta(src) {
  const out = {};
  const s = isObj(src) ? src : {};
  for (const k of Object.keys(META)) out[k] = int(s[k], 0, META[k].maxLevel, 0);
  return out;
}

function sPlot(pl) {
  if (!isObj(pl) || typeof pl.b !== 'string' || !has(BUILDING_BY_ID, pl.b)) return {};
  const def = BUILDING_BY_ID[pl.b];
  const out = { b: pl.b, level: int(pl.level, 1, 1e6, 1), t: Math.floor(Math.min(MAX_TIME, Math.max(0, fin(pl.t, 0)))) };
  if (def.choices) {
    if (isObj(pl.opt) && validateOpt(def, pl.opt) === null) out.opt = { district: pl.opt.district, strain: pl.opt.strain };
    else out.opt = defaultOpt(def);
  }
  if (has(pl, 'acc')) out.acc = Math.min(1e9, Math.max(0, fin(pl.acc, 0)));
  return out;
}

function defaultOpt(def) {
  const opt = {};
  if (def.choices.district) opt.district = 'rooftop_row';
  if (def.choices.strain) opt.strain = def.choices.strain[0];
  return validateOpt(def, opt) === null ? opt : undefined;
}

function sTown(src) {
  const s = isObj(src) ? src : {};
  let plots = Array.isArray(s.plots) ? s.plots.slice(0, MAX_PLOTS).map(sPlot) : [];
  while (plots.length < START_PLOTS) plots.push({});
  // limit per building
  const seen = {};
  plots = plots.map((pl) => {
    if (!pl.b) return pl;
    const lim = BUILDING_BY_ID[pl.b].limit;
    seen[pl.b] = (seen[pl.b] || 0) + 1;
    return seen[pl.b] > lim ? {} : pl;
  });
  const keys = {};
  for (const id of entries(s.keys)) if (has(CRATE_BY_ID, id)) keys[id] = int(s.keys[id], 0, 1e6, 0);
  for (const id of Object.keys(keys)) if (!keys[id]) delete keys[id];
  const st = isObj(s.streak) ? s.streak : {};
  const streak = { days: int(st.days, 0, 1e6, 0), last: int(st.last, -1, 1e7, -1) };
  if (streak.last < 0) streak.days = 0;
  const vi = isObj(s.visitor) ? s.visitor : {};
  const visitor = { slot: int(vi.slot, -1, 1e9, -1), claimed: bool(vi.claimed) };
  const mapsCleared = {};
  let n = 0;
  for (const id of entries(s.mapsCleared)) {
    if (!safeKey(id) || n >= 500) continue;
    mapsCleared[id] = int(s.mapsCleared[id], 0, 1e7, 0); n++;
  }
  const out = { plots, keys, xp: int(s.xp, 0, MAX_CUR, 0), streak, visitor, mapsCleared };
  if (has(s, 'keyFrac')) out.keyFrac = Math.min(1e6, Math.max(0, fin(s.keyFrac, 0)));
  return out;
}

function sProgress(src) {
  const s = isObj(src) ? src : {};
  const out = { district: int(s.district, 1, 1e6, 1), stage: int(s.stage, 1, 1e6, 1), best: {} };
  for (const k of entries(s.best)) {
    const d = Number(k);
    if (!Number.isInteger(d) || d < 1 || d > 1e6) continue;
    out.best[String(d)] = int(s.best[k], 0, 1e6, 0);
  }
  for (const k of ['maxCleared', 'echo', 'prevBest']) if (has(s, k)) out[k] = int(s[k], 0, 1e9, 0);
  return out;
}

function sNineLives(src) {
  const s = isObj(src) ? src : {};
  const out = { count: int(s.count, 0, 1e9, 0), shards: int(s.shards, 0, MAX_STAT, 0) };
  if (has(s, 'lastBest')) out.lastBest = int(s.lastBest, 0, 1e9, 0);
  if (bool(s.ascended) || out.count >= 9) out.ascended = true;
  return out;
}

function sPity(src) {
  const out = {};
  for (const k of entries(src)) {
    const [crate, tier, extra] = k.split('@');
    if (extra !== undefined || !has(CRATE_BY_ID, crate)) continue;
    if (tier !== undefined && !PITY_TIERS.includes(tier)) continue;
    out[k] = int(src[k], 0, 1000, 0);
  }
  return out;
}

function sStats(src) {
  const out = freshStats();
  const s = isObj(src) ? src : {};
  for (const k of COUNTER_KEYS) out[k] = int(s[k], 0, MAX_STAT, 0);
  out.crateOpens = int(s.crateOpens, 0, 1e9, 0);
  out.cratesTotal = int(s.cratesTotal, 0, 1e9, 0);
  out.gemDay = int(s.gemDay, -1, 1e7, -1);
  out.gemToday = int(s.gemToday, 0, 1e6, 0);
  // other sims may add their own counters: keep finite non-negative ones with safe names
  let extra = 0;
  for (const k of entries(s)) {
    if (has(out, k) || !safeKey(k) || extra >= MAX_FREE_KEYS) continue;
    const v = s[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) { out[k] = Math.min(MAX_STAT, Math.floor(v)); extra++; }
  }
  return out;
}

// ---- quests

const isQuest = (q) => isObj(q) && typeof q.id === 'string' && typeof q.tpl === 'string' && typeof q.text === 'string'
  && typeof q.metric === 'string' && has(METRICS, q.metric) && isObj(q.reward);
function sQuest(q) {
  if (!isQuest(q)) return null;
  return {
    id: q.id.slice(0, 40), tpl: q.tpl.slice(0, 40), metric: q.metric, text: q.text.slice(0, 120),
    target: Math.min(MAX_STAT, Math.max(1, fin(q.target, 1))), base: Math.min(MAX_STAT, Math.max(0, fin(q.base, 0))),
    reward: cleanJson(q.reward, 0), claimed: bool(q.claimed),
  };
}
/** Copy plain JSON data (numbers finite, depth and size limited). Used for reward specs. */
function cleanJson(x, depth) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') return x.slice(0, 80);
  if (typeof x === 'boolean') return x;
  if (depth > 4) return null;
  if (Array.isArray(x)) return x.slice(0, 16).map((v) => cleanJson(v, depth + 1)).filter((v) => v !== null);
  if (isObj(x)) {
    const o = {};
    let n = 0;
    for (const k of Object.keys(x)) { if (BAD_KEYS.has(k) || n++ >= 24) continue; const v = cleanJson(x[k], depth + 1); if (v !== null) o[k] = v; }
    return o;
  }
  return null;
}
function sBlock(b, idKey, count) {
  if (!isObj(b) || !Number.isInteger(b[idKey]) || b[idKey] < 0 || !Array.isArray(b.quests) || b.quests.length !== count) return null;
  const quests = b.quests.map(sQuest);
  if (quests.some((q) => !q)) return null;
  const bonus = isObj(b.bonus) && isObj(b.bonus.reward) ? { reward: cleanJson(b.bonus.reward, 0), claimed: bool(b.bonus.claimed) } : null;
  if (!bonus) return null;
  return { [idKey]: b[idKey], quests, bonus };
}
function sQuests(src) {
  const out = newQuestState();
  if (!isObj(src)) return out;
  out.daily = sBlock(src.daily, 'day', 3);
  out.weekly = sBlock(src.weekly, 'week', 4);   // an invalid block becomes null: refreshQuests rolls it again
  if (isObj(src.ach)) for (const f of ACHIEVEMENT_FAMILIES) if (has(src.ach, f.id)) out.ach[f.id] = int(src.ach[f.id], 0, 1e6, 0);
  if (isObj(src.col)) { let n = 0; for (const k of Object.keys(src.col)) if (safeKey(k) && src.col[k] && n++ < 1000) out.col[k] = true; }
  return out;
}

/**
 * Rebuild a profile from anything. Always returns a playable profile (never throws for any input a JSON file
 * or an in-memory mutation could produce). Does not mutate the input.
 */
export function sanitize(src) {
  const s = isObj(src) ? src : {};
  const seed = int(s.seed, 0, 4294967295, 1);
  const cards = sCards(s.cards);
  const cats = sCats(s.cats);
  const deck = sDeck(s.deck, cards);
  // a profile with no cats is not playable: grant the starters back
  if (!Object.keys(cats).length) for (const id of START.cats) cats[id] = { level: 1, dupes: 0, stars: 0 };
  for (const id of Object.keys(cats)) if (!cards['call_' + id] && has(CARD_BY_ID, 'call_' + id)) cards['call_' + id] = { level: 1, count: 1 };
  const town = sTown(s.town);
  if (!town.plots.some((pl) => pl.b)) town.plots[0] = { b: START.firstPlot.b, level: 1, t: 0 };
  const createdAt = Math.floor(Math.min(MAX_TIME, Math.max(0, fin(s.createdAt, 0))));
  const lastSeen = Math.floor(Math.min(MAX_TIME, Math.max(0, fin(s.lastSeen, createdAt))));
  return {
    v: PROFILE_VERSION,
    seed,
    createdAt,
    lastSeen,
    cur: sCur(s.cur),
    cats,
    deck,
    cards,
    relics: sRelics(s.relics),
    meta: sMeta(s.meta),
    town,
    progress: sProgress(s.progress),
    nineLives: sNineLives(s.nineLives),
    pity: sPity(s.pity),
    stats: sStats(s.stats),
    quests: sQuests(s.quests),
  };
}

// ------------------------------------------------------------------ migration

/**
 * Migration steps. MIGRATIONS[n] takes a v n object (already a plain object) and returns a v n+1 object.
 * Add a step here and bump PROFILE_VERSION; sanitize always runs at the end, so a step only has to translate shapes.
 *   v0 (the pre-release prototype): no `v`; `currency` or `cur`; cats as an array of ids or {id,level}; cards as
 *   {[id]:level}; relics as an array of ids; town as an array of {building|b, lvl|level}; `best` stage as a number.
 */
export const MIGRATIONS = {
  0(o) {
    const n = { ...o };
    if (!isObj(n.cur) && isObj(n.currency)) n.cur = n.currency;
    delete n.currency;
    if (Array.isArray(n.cats)) {
      const c = {};
      for (const e of n.cats) {
        if (typeof e === 'string') c[e] = { level: 1, dupes: 0, stars: 0 };
        else if (isObj(e) && typeof e.id === 'string') c[e.id] = { level: e.level || e.lvl || 1, dupes: e.dupes || 0, stars: e.stars || 0 };
      }
      n.cats = c;
    } else if (isObj(n.cats)) {
      const c = {};
      for (const id of Object.keys(n.cats)) c[id] = typeof n.cats[id] === 'number' ? { level: n.cats[id], dupes: 0, stars: 0 } : n.cats[id];
      n.cats = c;
    }
    if (isObj(n.cards)) {
      const c = {};
      for (const id of Object.keys(n.cards)) c[id] = typeof n.cards[id] === 'number' ? { level: n.cards[id], count: 1 } : n.cards[id];
      n.cards = c;
    }
    if (Array.isArray(n.relics)) { const r = {}; for (const id of n.relics) if (typeof id === 'string') r[id] = true; n.relics = r; }
    if (Array.isArray(n.town)) n.town = { plots: n.town };
    if (isObj(n.town) && Array.isArray(n.town.plots)) {
      n.town = { ...n.town, plots: n.town.plots.map((pl) => (isObj(pl) ? {
        b: pl.b !== undefined ? pl.b : pl.building, level: pl.level !== undefined ? pl.level : pl.lvl, t: pl.t !== undefined ? pl.t : pl.collected,
        ...(pl.opt ? { opt: pl.opt } : {}),
      } : {})) };
    }
    if (typeof n.progress === 'number') n.progress = { district: 1, stage: Math.max(1, n.progress), best: {} };
    if (!isObj(n.progress) && (typeof n.stage === 'number' || typeof n.district === 'number')) n.progress = { district: n.district || 1, stage: n.stage || 1, best: {} };
    if (n.lastSeen === undefined && typeof n.saved === 'number') n.lastSeen = n.saved;
    n.v = 1;
    return n;
  },
};

/**
 * Bring any saved object up to the current version and repair it. Never throws. Non objects give a fresh profile.
 * Newer saves (v above PROFILE_VERSION) are repaired as far as this build understands and stamped current.
 */
export function migrate(obj) {
  if (!isObj(obj)) return newProfile(1);
  let o = obj;
  let v = int(o.v, 0, 1e6, 0);
  let guard = 0;
  while (v < PROFILE_VERSION && guard++ < 100) {
    const step = MIGRATIONS[v];
    try { o = step ? step(o) : o; } catch (e) { o = {}; }
    v++;
  }
  return sanitize(o);
}

// ------------------------------------------------------------------ serialize

export function serialize(profile) { return JSON.stringify(sanitize(profile)); }

/** Parse and repair. Returns null when the text is not a JSON object at all. */
export function tryDeserialize(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > 8e6) return null;
  let o;
  try { o = JSON.parse(str); } catch (e) { return null; }
  return isObj(o) ? migrate(o) : null;
}

/** Parse and repair. Unreadable text gives a fresh profile (seed 1); use tryDeserialize to detect that. */
export function deserialize(str) { return tryDeserialize(str) || newProfile(1); }

// ------------------------------------------------------------------ storage

/**
 * Save to a storage-like object ({getItem,setItem,removeItem}). The previous main save becomes the backup first,
 * but only when it still parses, so a corrupt main never overwrites a good backup. Returns true on success.
 */
export function saveToStorage(profile, storage) {
  try {
    const text = serialize(profile);
    let prev = null;
    try { prev = storage.getItem(SAVE_KEY); } catch (e) { prev = null; }
    if (prev && tryDeserialize(prev)) { try { storage.setItem(BACKUP_KEY, prev); } catch (e) { /* quota: keep going */ } }
    storage.setItem(SAVE_KEY, text);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Load from storage. Tries the main save, then the backup. Returns the repaired profile, or null when there is
 * nothing readable (the shell then calls newProfile with a seed of its choosing).
 */
export function loadFromStorage(storage) {
  for (const key of [SAVE_KEY, BACKUP_KEY]) {
    try {
      const text = storage.getItem(key);
      const p = text ? tryDeserialize(text) : null;
      if (p) return p;
    } catch (e) { /* try the next */ }
  }
  return null;
}

/** Delete both saves (new game). */
export function clearStorage(storage) {
  for (const key of [SAVE_KEY, BACKUP_KEY]) { try { storage.removeItem(key); } catch (e) { /* ignore */ } }
}

// ------------------------------------------------------------------ small pure helpers for other modules

/** lastSeen only moves forward (clock changes cannot rewind offline accounting). Returns a new profile. */
export function touchSeen(profile, nowMs) {
  const now = Math.floor(Math.min(MAX_TIME, Math.max(0, fin(nowMs, 0))));
  const prev = Math.max(0, fin(profile && profile.lastSeen, 0));
  return { ...profile, lastSeen: Math.max(prev, now) };
}

/**
 * Grant gems that count against the daily cap (daily bonus, quests). Counters live in stats.gemDay and stats.gemToday
 * and reset when dayIndex changes. Returns {profile, granted}. Boss first-clear gems do not use this.
 */
export function grantDailyGems(profile, amount, dayIndex) {
  const day = int(dayIndex, 0, 1e7, 0);
  const stats = { ...(profile.stats || {}) };
  if ((stats.gemDay | 0) !== day) { stats.gemDay = day; stats.gemToday = 0; }
  const room = Math.max(0, REWARD.gemsDailyCapPerDay - (stats.gemToday | 0));
  const granted = Math.min(room, Math.max(0, Math.floor(fin(amount, 0))));
  stats.gemToday = (stats.gemToday | 0) + granted;
  const cur = { ...(profile.cur || {}) };
  cur.gems = Math.min(MAX_CUR, Math.max(0, Math.floor(fin(cur.gems, 0))) + granted);
  return { profile: { ...profile, cur, stats }, granted };
}

export { DECK_BASE_SLOTS };
