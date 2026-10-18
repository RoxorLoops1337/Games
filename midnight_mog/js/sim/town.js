// Midnight Mog town sim: building, upgrading, plots, adjacency, production, the collect and check-in loop,
// visitors, quests, achievements and the cat collection. Pure and deterministic: no DOM, no Date, no Math.random.
// Time is always passed in (nowMs in milliseconds, dayIndex as an integer). Every function returns NEW objects and
// never mutates the profile it is given. Failed actions return the profile they were given, unchanged.
//
// Rules this file keeps (see docs/SYSTEMS.md section 10):
//   - Output per plot = outputPerSecond(def, level, adjacency potency) x clock (1 + clock tower townOutputPct).
//   - A plot stores output for (townStorageSeconds + kitty bank storageSecondsAdd) x def.storage seconds.
//   - Anything that changes a rate (build, upgrade, plot unlock, swap) first BANKS the pending output of every
//     producing plot into plot.acc at the old rate, so no output is ever lost or invented by rearranging.
//   - Currencies are floored, clamped to [0, MAX_CUR] and never go negative. Spending checks first.
//   - A clock that goes backwards pays nothing and never moves any timer forward (see elapsedMs).

import {
  BUILDING_BY_ID, BUILDINGS, START_PLOTS, CHECKIN, adjacency, statsAt, statValue, outputPerSecond, upgradeCost, buildCost,
  plotUnlock, fillMult, streakBonus, advanceStreak, visitorSeconds, visitorForSlot, resolveReward, keyCrate, validateOpt,
  tierName, tierOf, mapAt, DISTRICT_CHOICES,
} from '../data/buildings.js';
import {
  COUNTER_KEYS, refreshQuests, questDone, questProgress, bonusReady, achievementStatus, achievementAt, collectionStatus,
  collectionBonuses, newQuestState,
} from '../data/quests.js';
import { cost, money, MAX_CUR, multipliers, income, townStorageSeconds, bestGlobalStage } from './economy.js';
import { grantDailyGems } from './profile.js';

export { collectionBonuses };

const MAX_PLOTS = 400;            // same limit profile.js repairs to
const MAX_KEYS = 1e6;
const MAX_STAT = 1e18;
const MS_PER_DAY = 86400000;
const BANK_LEVEL_CAP = 1000;       // loop guard for multi level upgrades

/** Producing buildings the collect loop pays: every PRODUCER plus the crate workshop (keys). */
const KEY_MAKER = 'crate_workshop';
const CURRENCY_ORDER = ['fish', 'yarn', 'xp', 'gems'];

// ------------------------------------------------------------------ small helpers

const fin = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const isTime = (x) => typeof x === 'number' && Number.isFinite(x);
const clampInt = (x, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(fin(x, lo))));

/** UTC day index of a timestamp. Pure arithmetic, never reads a clock. The shell may pass its own local day index instead. */
export function dayOf(nowMs) { return Math.max(0, Math.floor(fin(nowMs, 0) / MS_PER_DAY)); }

/**
 * Milliseconds elapsed since `t`. A clock that moved backwards (now < t) counts as 0, so a bad clock can pay nothing
 * and the caller resets t to now (t never stays in the future).
 */
function elapsedMs(nowMs, t) { return Math.max(0, nowMs - fin(t, 0)); }

function plotsOf(profile) { return (profile && profile.town && Array.isArray(profile.town.plots)) ? profile.town.plots : []; }

function townOf(profile) {
  const t = (profile && profile.town) || {};
  return {
    ...t,
    plots: plotsOf(profile),
    keys: { ...(t.keys || {}) },
    xp: Math.max(0, fin(t.xp, 0)),
    streak: { days: 0, last: -1, ...(t.streak || {}) },
    visitor: { slot: -1, claimed: false, ...(t.visitor || {}) },
    mapsCleared: { ...(t.mapsCleared || {}) },
  };
}

function withTown(profile, town) { return { ...profile, town }; }

function curOf(profile) { return { fish: 0, yarn: 0, gems: 0, tokens: 0, ...(profile.cur || {}) }; }

function statsOfProfile(profile) { return { ...(profile.stats || {}) }; }

function builtIds(profile) {
  const s = new Set();
  for (const p of plotsOf(profile)) if (p && p.b) s.add(p.b);
  return s;
}

function countOf(profile, b) {
  let n = 0;
  for (const p of plotsOf(profile)) if (p && p.b === b) n++;
  return n;
}

function defaultOpt(def) {
  if (!def.choices) return undefined;
  const opt = {};
  if (def.choices.district) opt.district = DISTRICT_CHOICES[0];
  if (def.choices.strain) opt.strain = def.choices.strain[0];
  return validateOpt(def, opt) === null ? opt : undefined;
}

// ------------------------------------------------------------------ rates

/** Which currency a producing building pays into: 'fish'|'yarn'|'xp'|'gems'|'keys', or null for a non producer. */
function primaryCurrency(def) {
  if (def.id === KEY_MAKER) return 'keys';
  for (const e of def.effects) {
    if (e.stat === 'fishPerSec') return 'fish';
    if (e.stat === 'yarnPerSec') return 'yarn';
    if (e.stat === 'xpPerSec') return 'xp';
    if (e.stat === 'gemsPerHour') return 'gems';
  }
  return null;
}

/** Output multiplier of the clock tower, 1 when none stands. */
function clockOf(plots) {
  let c = 1;
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p || !p.b) continue;
    const def = BUILDING_BY_ID[p.b];
    if (!def || !def.effects.some((e) => e.stat === 'townOutputPct')) continue;
    c += statsAt(def, p.level, adjacency(plots, i).potency).townOutputPct || 0;
  }
  return c;
}

/** Extra storage seconds (kitty bank) shared by every building. */
function storageAddOf(plots) {
  let add = 0;
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p || !p.b) continue;
    const def = BUILDING_BY_ID[p.b];
    if (!def) continue;
    const spec = def.effects.find((e) => e.stat === 'storageSecondsAdd');
    if (spec) add += statValue(spec, p.level, adjacency(plots, i).potency);
  }
  return add;
}

/**
 * Per plot production facts: [{i, b, level, def, cur, rate (units per second, clock included), capSeconds, potency}].
 * Only plots whose building has a currency (producers and the crate workshop) appear.
 */
function plotRates(profile) {
  const plots = plotsOf(profile);
  const clock = clockOf(plots);
  const baseCap = townStorageSeconds(profile) + storageAddOf(plots);
  const out = [];
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p || !p.b) continue;
    const def = BUILDING_BY_ID[p.b];
    const lvl = Math.floor(fin(p.level, 0));
    if (!def || lvl < 1) continue;
    const cur = primaryCurrency(def);
    if (!cur) continue;
    const pot = adjacency(plots, i).potency;
    let rate;
    if (cur === 'keys') rate = (statsAt(def, lvl, pot).keysPerDay || 0) / 86400 * clock;
    else rate = outputPerSecond(def, lvl, pot)[cur] * clock;
    out.push({ i, b: p.b, level: lvl, def, cur, rate: Math.max(0, fin(rate)), capSeconds: baseCap * (def.storage || 1), potency: pot });
  }
  return out;
}

/** Banked plus accrued output of one plot at nowMs, capped by its storage. Returns {amount, fill, capAmount}. */
function pendingOf(plot, rate, capSeconds, nowMs) {
  const acc = Math.max(0, fin(plot.acc, 0));
  const capAmount = rate * capSeconds;
  const room = Math.max(0, capAmount - acc);
  const accrued = Math.min(rate * elapsedMs(nowMs, plot.t) / 1000, room);
  const amount = acc + accrued;
  const fill = capAmount > 0 ? Math.min(1, amount / capAmount) : 0;
  return { amount, fill, capAmount };
}

/**
 * Production summary of the town.
 *   {fish, yarn, xp, gems, keys}  per second, before the income multiplier (fish and yarn equal economy.townOutput)
 *   passive : the same times economy.multipliers(profile).income for fish, yarn and xp (gems and keys unmultiplied)
 *   clock   : 1 + townOutputPct
 *   perPlot : [{i, b, level, cur, rate, capSeconds, potency}]
 */
export function production(profile) {
  const rows = plotRates(profile);
  const out = { fish: 0, yarn: 0, xp: 0, gems: 0, keys: 0 };
  for (const r of rows) out[r.cur] += r.rate;
  const m = multipliers(profile).income;
  return {
    ...out,
    passive: { fish: out.fish * m, yarn: out.yarn * m, xp: out.xp * m, gems: out.gems, keys: out.keys },
    clock: clockOf(plotsOf(profile)),
    perPlot: rows.map((r) => ({ i: r.i, b: r.b, level: r.level, cur: r.cur, rate: r.rate, capSeconds: r.capSeconds, potency: r.potency })),
  };
}

/**
 * Sum of every town wide stat over all standing buildings, with adjacency potency: {statName: value}.
 * Production stats and the garden's buffPct are included too (use gardenBuffs for the garden).
 */
export function townStats(profile) {
  const plots = plotsOf(profile);
  const out = {};
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p || !p.b) continue;
    const def = BUILDING_BY_ID[p.b];
    if (!def || !(Math.floor(fin(p.level, 0)) >= 1)) continue;
    const st = statsAt(def, p.level, adjacency(plots, i).potency);
    for (const k of Object.keys(st)) out[k] = (out[k] || 0) + st[k];
  }
  return out;
}

/** Catnip Garden buffs for a battle in `districtId`: {dmg, rate, hp} as fractions (0.3 of the value elsewhere). */
export function gardenBuffs(profile, districtId) {
  const plots = plotsOf(profile);
  const out = { dmg: 0, rate: 0, hp: 0 };
  for (let i = 0; i < plots.length; i++) {
    const p = plots[i];
    if (!p || p.b !== 'catnip_garden' || !p.opt || !(Math.floor(fin(p.level, 0)) >= 1)) continue;
    const v = statsAt(BUILDING_BY_ID.catnip_garden, p.level, adjacency(plots, i).potency).buffPct || 0;
    if (out[p.opt.strain] !== undefined) out[p.opt.strain] += p.opt.district === districtId ? v : v * 0.3;
  }
  return out;
}

/**
 * Everything the UI shows about one plot: {index, empty, b, level, tier, tierName, potency, bonus, parts, cur, rate,
 * capSeconds, pending, fill, full, nextCost (fish, Infinity when maxed), stats}.
 */
export function plotInfo(profile, index, nowMs = 0) {
  const plots = plotsOf(profile);
  const p = plots[index];
  if (!p || !p.b) return { index, empty: true };
  const def = BUILDING_BY_ID[p.b];
  const adj = adjacency(plots, index);
  const info = {
    index, empty: false, b: p.b, level: p.level, tier: tierOf(p.level), tierName: tierName(def, p.level),
    potency: adj.potency, bonus: adj.bonus, parts: adj.parts, stats: statsAt(def, p.level, adj.potency),
    nextCost: upgradeCost(def, p.level, cost), opt: p.opt,
  };
  const row = plotRates(profile).find((r) => r.i === index);
  if (row) {
    const pend = pendingOf(p, row.rate, row.capSeconds, nowMs);
    Object.assign(info, { cur: row.cur, rate: row.rate, capSeconds: row.capSeconds, pending: pend.amount, fill: pend.fill, full: pend.fill >= CHECKIN.fillBonusAt });
  }
  return info;
}

// ------------------------------------------------------------------ banking (keeps rates fair when the layout changes)

/** Copy of the plots with every producing plot's pending output banked into plot.acc and t reset to nowMs. */
function bankAll(profile, nowMs) {
  const plots = plotsOf(profile).map((p) => (p && p.b ? { ...p } : {}));
  for (const r of plotRates(profile)) {
    const p = plots[r.i];
    const pend = pendingOf(p, r.rate, r.capSeconds, nowMs);
    p.acc = pend.amount;
    p.t = nowMs;
  }
  for (const p of plots) if (p.b && !(p.acc > 0)) delete p.acc;
  return plots;
}

// ------------------------------------------------------------------ build, upgrade, unlock, move

/**
 * Can building `b` be placed on owned plot index `plot`? Returns {ok, reason, cost:{fish,gems}, needStage}.
 * reason: unknown_building | bad_plot | occupied | limit | locked | need_fish | need_gems | null.
 */
export function canBuild(profile, b, plot) {
  const def = BUILDING_BY_ID[b];
  if (!def) return { ok: false, reason: 'unknown_building', cost: { fish: 0, gems: 0 }, needStage: 0 };
  const c = buildCost(def, cost);
  const res = (reason) => ({ ok: reason === null, reason, cost: c, needStage: def.unlockStage });
  const plots = plotsOf(profile);
  if (!Number.isInteger(plot) || plot < 0 || plot >= plots.length) return res('bad_plot');
  if (plots[plot] && plots[plot].b) return res('occupied');
  if (countOf(profile, b) >= def.limit) return res('limit');
  if (bestGlobalStage(profile) < def.unlockStage) return res('locked');
  const cur = curOf(profile);
  if (cur.fish < c.fish) return res('need_fish');
  if (cur.gems < c.gems) return res('need_gems');
  return res(null);
}

/**
 * Build `b` on owned plot index `plot`. opt is only for the Catnip Garden ({district, strain}); it defaults to the
 * first choices. Returns {ok, reason, profile, cost}.
 */
export function build(profile, b, plot, nowMs, opt) {
  const chk = canBuild(profile, b, plot);
  if (!chk.ok) return { ok: false, reason: chk.reason, profile, cost: chk.cost };
  if (!isTime(nowMs)) return { ok: false, reason: 'bad_time', profile, cost: chk.cost };
  const def = BUILDING_BY_ID[b];
  let useOpt;
  if (def.choices) {
    useOpt = opt === undefined ? defaultOpt(def) : opt;
    if (validateOpt(def, useOpt) !== null) return { ok: false, reason: 'bad_option', profile, cost: chk.cost };
    useOpt = { district: useOpt.district, strain: useOpt.strain };
  }
  const plots = bankAll(profile, nowMs);
  plots[plot] = { b, level: 1, t: nowMs, ...(useOpt ? { opt: useOpt } : {}) };
  const cur = curOf(profile);
  cur.fish = money(cur.fish - chk.cost.fish);
  cur.gems = money(cur.gems - chk.cost.gems);
  return { ok: true, reason: null, cost: chk.cost, profile: { ...withTown(profile, { ...townOf(profile), plots }), cur } };
}

/** Fish cost of the next level of plot `plot`: {fish, level, maxed}. maxed when the cost reached 1e15. */
export function upgradeInfo(profile, plot) {
  const p = plotsOf(profile)[plot];
  if (!p || !p.b) return { fish: 0, level: 0, maxed: true };
  const def = BUILDING_BY_ID[p.b];
  const fish = upgradeCost(def, p.level, cost);
  return { fish, level: p.level, maxed: !(fish < 1e15) };
}

/**
 * Upgrade the building on `plot` by `times` levels (default 1) as far as the fish allow. Returns
 * {ok, reason, profile, levels, cost}. reason: bad_plot | empty | maxed | need_fish | bad_time | null.
 */
export function upgrade(profile, plot, nowMs, times = 1) {
  const plots = plotsOf(profile);
  if (!Number.isInteger(plot) || plot < 0 || plot >= plots.length) return { ok: false, reason: 'bad_plot', profile, levels: 0, cost: 0 };
  const p = plots[plot];
  if (!p || !p.b) return { ok: false, reason: 'empty', profile, levels: 0, cost: 0 };
  if (!isTime(nowMs)) return { ok: false, reason: 'bad_time', profile, levels: 0, cost: 0 };
  const def = BUILDING_BY_ID[p.b];
  const want = Math.min(BANK_LEVEL_CAP, Math.max(1, Math.floor(fin(times, 1))));
  const cur = curOf(profile);
  let level = Math.max(1, Math.floor(fin(p.level, 1))), fish = cur.fish, spent = 0, gained = 0, reason = null;
  while (gained < want) {
    const c = upgradeCost(def, level, cost);
    if (!(c < 1e15)) { reason = 'maxed'; break; }
    if (fish < c) { reason = 'need_fish'; break; }
    fish -= c; spent += c; level++; gained++;
  }
  if (gained === 0) return { ok: false, reason, profile, levels: 0, cost: 0 };
  const newPlots = bankAll(profile, nowMs);
  newPlots[plot] = { ...newPlots[plot], level };
  cur.fish = money(fish);
  const stats = statsOfProfile(profile);
  stats.upgrades = clampInt((stats.upgrades | 0) + gained, 0, MAX_STAT);
  return { ok: true, reason: null, levels: gained, cost: spent, profile: { ...withTown(profile, { ...townOf(profile), plots: newPlots }), cur, stats } };
}

/** Cost and requirement of the next plot: {fish, needStage, plotIndex, ok, reason}. reason: locked | need_fish | max_plots | null. */
export function plotUnlockInfo(profile) {
  const n = Math.max(0, plotsOf(profile).length - START_PLOTS);
  const u = plotUnlock(n, cost);
  let reason = null;
  if (plotsOf(profile).length >= MAX_PLOTS) reason = 'max_plots';
  else if (bestGlobalStage(profile) < u.needStage) reason = 'locked';
  else if (curOf(profile).fish < u.fish) reason = 'need_fish';
  return { ...u, ok: reason === null, reason };
}

/** Buy the next plot. Returns {ok, reason, profile, cost, plotIndex}. */
export function unlockPlot(profile, nowMs) {
  const info = plotUnlockInfo(profile);
  if (!info.ok) return { ok: false, reason: info.reason, profile, cost: info.fish, plotIndex: info.plotIndex };
  if (!isTime(nowMs)) return { ok: false, reason: 'bad_time', profile, cost: info.fish, plotIndex: info.plotIndex };
  const plots = bankAll(profile, nowMs);   // a new plot turns open sky into an owned cell, which can change potency
  plots.push({});
  const cur = curOf(profile);
  cur.fish = money(cur.fish - info.fish);
  return { ok: true, reason: null, cost: info.fish, plotIndex: info.plotIndex, profile: { ...withTown(profile, { ...townOf(profile), plots }), cur } };
}

/** Swap the contents of two owned plots (move a building to an empty plot or trade places). Free. Returns {ok, reason, profile}. */
export function swap(profile, a, b, nowMs) {
  const plots = plotsOf(profile);
  const okIdx = (i) => Number.isInteger(i) && i >= 0 && i < plots.length;
  if (!okIdx(a) || !okIdx(b) || a === b) return { ok: false, reason: 'bad_plot', profile };
  if (!isTime(nowMs)) return { ok: false, reason: 'bad_time', profile };
  if (!(plots[a] && plots[a].b) && !(plots[b] && plots[b].b)) return { ok: false, reason: 'empty', profile };
  const banked = bankAll(profile, nowMs);
  const tmp = banked[a]; banked[a] = banked[b]; banked[b] = tmp;
  return { ok: true, reason: null, profile: withTown(profile, { ...townOf(profile), plots: banked }) };
}

/** Change the district and strain of a Catnip Garden. Returns {ok, reason, profile}. */
export function setOpt(profile, plot, opt) {
  const plots = plotsOf(profile);
  const p = plots[plot];
  if (!p || !p.b) return { ok: false, reason: 'empty', profile };
  const def = BUILDING_BY_ID[p.b];
  if (!def.choices) return { ok: false, reason: 'no_options', profile };
  if (validateOpt(def, opt) !== null) return { ok: false, reason: 'bad_option', profile };
  const next = plots.map((x, i) => (i === plot ? { ...x, opt: { district: opt.district, strain: opt.strain } } : x));
  return { ok: true, reason: null, profile: withTown(profile, { ...townOf(profile), plots: next }) };
}

// ------------------------------------------------------------------ paying rewards

/** Add a resolved reward ({fish,yarn,xp,gems,tokens,keys}) to a profile. capGems routes gems through the daily gem cap. */
function grant(profile, res, dayIndex, capGems) {
  let p = profile;
  const cur = curOf(p);
  cur.fish = money(cur.fish + (res.fish || 0));
  cur.yarn = money(cur.yarn + (res.yarn || 0));
  cur.tokens = money(cur.tokens + (res.tokens || 0));
  let gemsGranted = 0;
  if (!capGems) { cur.gems = money(cur.gems + (res.gems || 0)); gemsGranted = res.gems || 0; }
  const town = townOf(p);
  town.xp = Math.min(MAX_CUR, Math.floor(town.xp + (res.xp || 0)));
  for (const id of Object.keys(res.keys || {})) {
    const n = Math.max(0, Math.floor(res.keys[id]));
    if (n) town.keys[id] = Math.min(MAX_KEYS, (town.keys[id] | 0) + n);
  }
  const stats = statsOfProfile(p);
  if (res.fish) stats.fishEarned = Math.min(MAX_STAT, fin(stats.fishEarned, 0) + res.fish);
  p = { ...withTown(p, town), cur, stats };
  if (capGems && res.gems > 0) {
    const g = grantDailyGems(p, res.gems, dayIndex);
    p = g.profile;
    gemsGranted = g.granted;
  }
  return { profile: p, gemsGranted };
}

/** perMinute income used to resolve minute based rewards: {fish, yarn, xp} (income.active x 60, xp from the town). */
export function perMinute(profile) {
  const inc = income(profile);
  const prod = production(profile);
  return { fish: inc.active.fish * 60, yarn: inc.active.yarn * 60, xp: prod.passive.xp * 60 };
}

// ------------------------------------------------------------------ collect and check in

/**
 * Collect every producing plot. dayIndex defaults to the UTC day of nowMs; pass the shell's own day index to use the
 * player's local day. Per plot: batch = pending x fillMult(fill) x (1 + streakBonus(days)) x income multiplier
 * (fish, yarn and xp only; gems are never multiplied by income). The first collect on a new day advances the streak
 * (kitty bank grace) and pays a daily tip of CHECKIN.dailyTipMinutes of production. Crate Workshop output turns into
 * town.keys (fractions are kept in town.keyFrac). Gems keep their fraction in the plot until a whole gem is ready.
 *
 * Returns {ok, reason, profile, gained:{fish,yarn,xp,gems,keys:{}}, tip:{fish,yarn,xp}, streak:{days,last,fresh,bonus},
 * plots:[{i, b, cur, amount, fill, full}], fullCount}.
 */
export function collect(profile, nowMs, dayIndex) {
  const none = { fish: 0, yarn: 0, xp: 0, gems: 0, keys: {} };
  if (!isTime(nowMs)) return { ok: false, reason: 'bad_time', profile, gained: none, tip: { fish: 0, yarn: 0, xp: 0 }, streak: null, plots: [], fullCount: 0 };
  const day = Number.isInteger(dayIndex) ? dayIndex : dayOf(nowMs);
  const town = townOf(profile);
  const plots = town.plots.map((p) => (p && p.b ? { ...p } : {}));
  const stats0 = statsOfProfile(profile);
  const inc = multipliers(profile).income;

  // streak first: the first collect of a new day counts for its own bonus
  const grace = Math.floor(townStats(profile).streakGrace || 0);
  const adv = advanceStreak(town.streak, day, grace);
  const sBonus = streakBonus(adv.days);
  const streak = { days: adv.days, last: adv.last, fresh: adv.fresh, bonus: sBonus };
  town.streak = { days: adv.days, last: adv.last };

  const rows = plotRates(profile);
  const tot = { fish: 0, yarn: 0, xp: 0, gems: 0 };
  let keyAmount = 0, keyLevel = 1;
  const report = [];
  let fullCount = 0;
  for (const r of rows) {
    const p = plots[r.i];
    const pend = pendingOf(p, r.rate, r.capSeconds, nowMs);
    const full = pend.fill >= CHECKIN.fillBonusAt;
    if (full) fullCount++;
    report.push({ i: r.i, b: r.b, cur: r.cur, amount: pend.amount, fill: pend.fill, full });
    p.t = nowMs;                              // also pulls a future t back to now (clock went backwards)
    if (r.cur === 'keys') { keyAmount += pend.amount; keyLevel = r.level; delete p.acc; continue; }
    const batch = pend.amount * fillMult(pend.fill) * (1 + sBonus) * (r.cur === 'gems' ? 1 : inc);
    if (r.cur === 'gems') {
      const whole = Math.floor(batch + 1e-9);
      tot.gems += whole;
      const rest = batch - whole;
      if (rest > 1e-9) p.acc = rest; else delete p.acc;
    } else {
      tot[r.cur] += batch;
      delete p.acc;
    }
  }

  // Crate Workshop keys
  const keysGained = {};
  if (keyAmount > 0 || rows.some((r) => r.cur === 'keys')) {
    const frac = Math.max(0, fin(town.keyFrac, 0)) + keyAmount;
    const whole = Math.floor(frac + 1e-9);
    town.keyFrac = Math.max(0, frac - whole);
    if (whole > 0) {
      const id = keyCrate(keyLevel);
      const had = town.keys[id] | 0;
      const now = Math.min(MAX_KEYS, had + whole);
      town.keys[id] = now;
      keysGained[id] = now - had;
    }
  }

  // daily tip: dailyTipMinutes of production, once per new day
  const tip = { fish: 0, yarn: 0, xp: 0 };
  if (adv.fresh && rows.length) {
    const prod = production(profile);
    for (const k of ['fish', 'yarn', 'xp']) tip[k] = Math.floor(prod[k] * CHECKIN.dailyTipMinutes * 60 * (1 + sBonus) * inc);
  }

  const gained = {
    fish: Math.floor(tot.fish + tip.fish), yarn: Math.floor(tot.yarn + tip.yarn), xp: Math.floor(tot.xp + tip.xp),
    gems: Math.floor(tot.gems), keys: keysGained,
  };
  const cur = curOf(profile);
  cur.fish = money(cur.fish + gained.fish);
  cur.yarn = money(cur.yarn + gained.yarn);
  cur.gems = money(cur.gems + gained.gems);
  town.xp = Math.min(MAX_CUR, Math.floor(town.xp + gained.xp));
  town.plots = plots;

  const stats = stats0;
  const anything = gained.fish + gained.yarn + gained.xp + gained.gems + Object.values(keysGained).reduce((s, v) => s + v, 0) > 0;
  if (anything) stats.collects = clampInt((stats.collects | 0) + 1, 0, MAX_STAT);
  if (gained.fish > 0) stats.fishEarned = Math.min(MAX_STAT, fin(stats.fishEarned, 0) + gained.fish);

  return { ok: true, reason: null, profile: { ...withTown(profile, town), cur, stats }, gained, tip, streak, plots: report, fullCount };
}

// ------------------------------------------------------------------ visitors

/** Current visitor slot and who is in it: {slot, kind, claimed, secondsLeft, interval}. Pure function of nowMs, seed and buildings. */
export function visitorState(profile, nowMs) {
  const cut = townStats(profile).visitorIntervalCut || 0;
  const interval = visitorSeconds(cut);
  const nowS = Math.max(0, fin(nowMs, 0) / 1000);
  const slot = Math.floor(nowS / interval);
  const v = (profile.town && profile.town.visitor) || { slot: -1, claimed: false };
  const kind = visitorForSlot(slot, profile.seed, builtIds(profile));
  const claimed = v.slot === slot && !!v.claimed;
  return { slot, kind, claimed, interval, secondsLeft: Math.max(0, Math.ceil((slot + 1) * interval - nowS)), stale: v.slot > slot };
}

/**
 * Claim the visitor of the current slot, once per slot. Returns {ok, reason, profile, visitor, reward, gemsGranted}.
 * reason: bad_time | claimed | clock (the stored slot is ahead of this clock) | null.
 */
export function claimVisitor(profile, nowMs, dayIndex) {
  if (!isTime(nowMs)) return { ok: false, reason: 'bad_time', profile };
  const st = visitorState(profile, nowMs);
  if (st.stale) return { ok: false, reason: 'clock', profile, visitor: st.kind };
  if (st.claimed) return { ok: false, reason: 'claimed', profile, visitor: st.kind };
  const reward = resolveReward(st.kind.reward, perMinute(profile));
  const day = Number.isInteger(dayIndex) ? dayIndex : dayOf(nowMs);
  const g = grant(profile, reward, day, true);
  const town = townOf(g.profile);
  town.visitor = { slot: st.slot, claimed: true };
  return { ok: true, reason: null, profile: withTown(g.profile, town), visitor: st.kind, reward, gemsGranted: g.gemsGranted };
}

// ------------------------------------------------------------------ observatory maps

/** Maps the observatory has unlocked: [{...mapAt(n), stage, rewardMult (with mapRewardPct), clearedToday}]. */
export function maps(profile, dayIndex) {
  const st = townStats(profile);
  const n = Math.floor(st.mapsUnlocked || 0);
  const best = bestGlobalStage(profile);
  const cleared = (profile.town && profile.town.mapsCleared) || {};
  const out = [];
  for (let i = 0; i < n && i < 200; i++) {
    const m = mapAt(i);
    out.push({ ...m, stage: Math.max(1, Math.round(best * m.difficulty)), rewardMult: m.rewardMult * (1 + (st.mapRewardPct || 0)), clearedToday: cleared[m.id] === dayIndex });
  }
  return out;
}

/** Record a map win. The first win per map per day index pays 1 gem (daily gem cap applies). Returns {ok, reason, profile, gems}. */
export function claimMapClear(profile, mapId, dayIndex) {
  const list = maps(profile, dayIndex);
  const m = list.find((x) => x.id === mapId);
  if (!m) return { ok: false, reason: 'locked', profile, gems: 0 };
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return { ok: false, reason: 'bad_day', profile, gems: 0 };
  if (m.clearedToday) return { ok: false, reason: 'claimed', profile, gems: 0 };
  const g = grantDailyGems(profile, 1, dayIndex);
  const town = townOf(g.profile);
  town.mapsCleared[mapId] = dayIndex;
  return { ok: true, reason: null, profile: withTown(g.profile, town), gems: g.granted };
}

// ------------------------------------------------------------------ training xp

/** Pay a yarn cost with training xp first (1 xp = 1 yarn). Returns {profile, xpUsed, yarnDue}; the caller pays yarnDue in yarn. */
export function payWithXp(profile, yarnCost) {
  const need = Math.max(0, Math.floor(fin(yarnCost, 0)));
  const town = townOf(profile);
  const used = Math.min(Math.floor(town.xp), need);
  town.xp = Math.max(0, town.xp - used);
  return { profile: withTown(profile, town), xpUsed: used, yarnDue: need - used };
}

// ------------------------------------------------------------------ stats hooks, quests

/**
 * Progress hook for the other sims and the shell: add to the quest counters in profile.stats.
 * delta = {battlesWon: 1, kills: 12, ...}. Only finite non negative numbers are added. Returns a new profile.
 */
export function recordStats(profile, delta) {
  const stats = statsOfProfile(profile);
  for (const k of Object.keys(delta || {})) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k) || k === '__proto__') continue;
    const v = delta[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    stats[k] = Math.min(MAX_STAT, fin(stats[k], 0) + v);
  }
  return { ...profile, stats };
}

/** Roll the daily and weekly quests for dayIndex (idempotent for the same day). Returns a new profile. */
export function refresh(profile, dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return profile;
  const pm = perMinute(profile);
  const quests = refreshQuests(profile.quests || newQuestState(), dayIndex, profile, { perMinute: { fish: pm.fish, yarn: pm.yarn } });
  return { ...profile, quests };
}

/** Progress of every quest of a block: [{quest, progress, done}]. kind: 'daily'|'weekly'. */
export function questView(profile, kind) {
  const block = profile.quests && profile.quests[kind];
  if (!block) return [];
  return block.quests.map((q) => ({ quest: q, progress: questProgress(q, profile), done: questDone(q, profile) }));
}

/**
 * Claim one quest. kind 'daily'|'weekly', index 0-based. Daily gems go through the daily gem cap; weekly gems do not.
 * Returns {ok, reason, profile, reward, gemsGranted}. reason: none | bad_index | claimed | not_done | stale | null.
 */
export function claimQuest(profile, kind, index, dayIndex) {
  const block = profile.quests && profile.quests[kind];
  if (kind !== 'daily' && kind !== 'weekly') return { ok: false, reason: 'bad_kind', profile };
  if (!block) return { ok: false, reason: 'none', profile };
  if (Number.isInteger(dayIndex) && (kind === 'daily' ? block.day !== dayIndex : block.week !== Math.floor(dayIndex / 7))) return { ok: false, reason: 'stale', profile };
  const q = block.quests[index];
  if (!q) return { ok: false, reason: 'bad_index', profile };
  if (q.claimed) return { ok: false, reason: 'claimed', profile };
  if (!questDone(q, profile)) return { ok: false, reason: 'not_done', profile };
  const reward = resolveReward(q.reward, perMinute(profile));
  const g = grant(profile, reward, dayIndex, kind === 'daily');
  const quests = { ...g.profile.quests, [kind]: { ...block, quests: block.quests.map((x, i) => (i === index ? { ...x, claimed: true } : x)) } };
  return { ok: true, reason: null, profile: { ...g.profile, quests }, reward, gemsGranted: g.gemsGranted };
}

/** Claim the bonus of a block when all its quests are claimed. Returns {ok, reason, profile, reward, gemsGranted}. */
export function claimBonus(profile, kind, dayIndex) {
  const block = profile.quests && profile.quests[kind];
  if (kind !== 'daily' && kind !== 'weekly') return { ok: false, reason: 'bad_kind', profile };
  if (!block) return { ok: false, reason: 'none', profile };
  if (!bonusReady(block)) return { ok: false, reason: block.bonus.claimed ? 'claimed' : 'not_ready', profile };
  const reward = resolveReward(block.bonus.reward, perMinute(profile));
  const g = grant(profile, reward, dayIndex, kind === 'daily');
  const quests = { ...g.profile.quests, [kind]: { ...block, bonus: { ...block.bonus, claimed: true } } };
  return { ok: true, reason: null, profile: { ...g.profile, quests }, reward, gemsGranted: g.gemsGranted };
}

// ------------------------------------------------------------------ achievements and collection

/** Status of every achievement family (see quests.achievementStatus). */
export function achievements(profile) { return achievementStatus(profile, profile.quests); }

/** Claim the next ready tier of one family. Returns {ok, reason, profile, entry, reward}. reason: unknown | not_ready | null. */
export function claimAchievement(profile, familyId) {
  const st = achievementStatus(profile, profile.quests).find((s) => s.family === familyId);
  if (!st) return { ok: false, reason: 'unknown', profile };
  if (st.ready < 1) return { ok: false, reason: 'not_ready', profile };
  const entry = achievementAt(familyId, st.claimed);
  const reward = resolveReward(entry.reward, perMinute(profile));
  const g = grant(profile, reward, 0, false);
  const base = g.profile.quests || newQuestState();
  const quests = { ...base, ach: { ...(base.ach || {}), [familyId]: st.claimed + 1 } };
  return { ok: true, reason: null, profile: { ...g.profile, quests }, entry, reward };
}

/** Claim every ready tier of every family. Returns {profile, claimed: [entry...]}. */
export function claimAllAchievements(profile) {
  let p = profile;
  const claimed = [];
  for (let guard = 0; guard < 2000; guard++) {
    const ready = achievementStatus(p, p.quests).find((s) => s.ready > 0);
    if (!ready) break;
    const r = claimAchievement(p, ready.family);
    if (!r.ok) break;
    p = r.profile;
    claimed.push(r.entry);
  }
  return { profile: p, claimed };
}

/** Collection entries with progress (see quests.collectionStatus). */
export function collection(profile) { return collectionStatus(profile, profile.quests); }

/** Claim one collection entry that is complete. Returns {ok, reason, profile, entry, reward}. reason: unknown | not_done | claimed | null. */
export function claimCollection(profile, entryId) {
  const entry = collectionStatus(profile, profile.quests).find((e) => e.id === entryId);
  if (!entry) return { ok: false, reason: 'unknown', profile };
  if (entry.claimed) return { ok: false, reason: 'claimed', profile };
  if (!entry.done) return { ok: false, reason: 'not_done', profile };
  const reward = resolveReward(entry.reward, perMinute(profile));
  const g = grant(profile, reward, 0, false);
  const base = g.profile.quests || newQuestState();
  const quests = { ...base, col: { ...(base.col || {}), [entryId]: true } };
  return { ok: true, reason: null, profile: { ...g.profile, quests }, entry, reward };
}

/** Convenience for the shell on launch or resume: roll quests for the day, then collect. Returns the collect result with the refreshed profile. */
export function checkIn(profile, nowMs, dayIndex) {
  const day = Number.isInteger(dayIndex) ? dayIndex : dayOf(nowMs);
  const refreshed = refresh(profile, day);
  const r = collect(refreshed, nowMs, day);
  return r.ok ? r : { ...r, profile: refreshed };
}

export { BUILDINGS, COUNTER_KEYS, CURRENCY_ORDER };
