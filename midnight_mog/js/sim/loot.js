// Loot: crate odds, rolling, pity, duplicates. Pure and deterministic (all randomness comes from the rng argument).
//
// ONE SOURCE OF TRUTH: oddsTable() and openCrate() both call rarityProbs(), so the numbers the UI prints
// are the numbers the roll uses. There is no hidden luck: the only modifiers are the pity counters (shown),
// the crate_luck meta perk (shown) and the x10 guarantee (shown). Nothing depends on spending or on time.
//
// The result of every pull is rolled BEFORE any animation and returned in `drops`. Reveal beats (tells,
// near-miss fake-outs) are cosmetic metadata derived from the final result; they can never change it.

import { CATS } from '../data/cats.js';
import { CARDS } from '../data/cards.js';
import { RELICS } from '../data/relics.js';
import {
  CRATES, CRATE_BY_ID, RARITY_IDS, PITY_TIERS, LUCK_PER_LEVEL, MULTI_COUNT,
  STAR_DUPES, MAX_STARS, DUPE_SHARE,
} from '../data/crates.js';
import { crateCost, DUPE_YARN, metaLevel, money } from './economy.js';
import { BUILDING_BY_ID, adjacency, statValue } from '../data/buildings.js';

export { CRATES, CRATE_BY_ID };

const TIER_IDX = { epic: 2, legend: 3, mythic: 4 };

// ------------------------------------------------------------------ pools

const POOL = { cat: {}, card: {}, relic: {} };
for (const r of RARITY_IDS) { POOL.cat[r] = []; POOL.card[r] = []; POOL.relic[r] = []; }
for (const c of CATS) POOL.cat[c.rarity].push(c.id);
// Summon cards come with their cat (a new cat grants its call_ card), so card drops are spells, traps, builds.
for (const c of CARDS) if (c.type !== 'summon') POOL.card[c.rarity].push(c.id);
for (const r of RELICS) POOL.relic[r.rarity].push(r.id);

export function poolSizes() {
  const out = {};
  for (const r of RARITY_IDS) out[r] = { cat: POOL.cat[r].length, card: POOL.card[r].length, relic: POOL.relic[r].length };
  return out;
}

// ------------------------------------------------------------------ pity counters
// profile.pity is {[key]: int}. Keys: `<crate>` = pulls since last epic or better, `<crate>@legend`,
// `<crate>@mythic` likewise. Missing means 0.

export function pityKey(crateId, tier) { return tier === 'epic' ? crateId : crateId + '@' + tier; }

/** Pulls of pity credit the Crate Workshop gives (its pityCredit stat with adjacency potency), 0 without one. */
export function townPityCredit(profile) {
  const pl = profile && profile.town && profile.town.plots;
  if (!Array.isArray(pl)) return 0;
  const def = BUILDING_BY_ID.crate_workshop;
  const spec = def && def.effects.find((e) => e.stat === 'pityCredit');
  if (!spec) return 0;
  let credit = 0;
  for (let i = 0; i < pl.length; i++) {
    const p = pl[i];
    if (!p || p.b !== 'crate_workshop' || !(Math.floor(p.level) >= 1)) continue;
    credit = Math.max(credit, statValue(spec, p.level, adjacency(pl, i).potency));
  }
  return Math.max(0, Math.floor(credit));
}

/**
 * Pity counters used to compute odds. `withCredit` (default true) adds the Crate Workshop credit: it is added only
 * when the odds and the roll are computed, never stored, and never lifts a counter into the hard pity by itself
 * (it stops 2 pulls short of the hard limit; a real counter above that is left as it is).
 * openCrate stores the raw counters (withCredit false).
 */
export function pityCounters(profile, crateId, withCredit = true) {
  const pity = (profile && profile.pity) || {};
  const credit = withCredit ? townPityCredit(profile) : 0;
  const def = CRATE_BY_ID[crateId];
  const out = {};
  for (const t of PITY_TIERS) {
    const v = pity[pityKey(crateId, t)];
    const raw = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    const cfg = def && def.pity && def.pity[t];
    out[t] = credit > 0 && cfg ? Math.max(raw, Math.min(raw + credit, cfg.hard - 2)) : raw;
  }
  return out;
}

// ------------------------------------------------------------------ probabilities

export function luckLevel(profile) {
  return profile ? Math.min(5, metaLevel(profile, 'crate_luck')) : 0;
}

/** Base rarity probabilities (fractions summing to 1) after the visible crate_luck perk. */
export function baseProbs(def, luck = 0) {
  const k = 1 + LUCK_PER_LEVEL * luck;
  const w = RARITY_IDS.map((r, i) => def.weights[r] * (i === 0 ? 1 : k));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

/** Chance of tier T or better on the next pull given its counter (pulls since last T or better). */
export function tierChance(def, tier, counter, base) {
  const idx = TIER_IDX[tier];
  let tail = 0;
  for (let i = idx; i < 5; i++) tail += base[i];
  const cfg = def.pity[tier];
  if (!cfg || tail <= 0) return tail;
  const n = counter + 1;                       // this is pull number n since the last hit
  if (n >= cfg.hard) return 1;
  if (n <= cfg.soft) return tail;
  const t = (n - cfg.soft) / (cfg.hard - cfg.soft);
  return tail + (1 - tail) * t;
}

/**
 * The one function that defines the odds. Returns {probs:[5], forced: highest tier at hard pity or null,
 * soft: {tier:bool}}. `minIdx` restricts to that rarity or better (the x10 guarantee slot).
 */
export function rarityProbs(def, counters, luck = 0, minIdx = 0) {
  const base = baseProbs(def, luck);
  const q = [1, 1, 0, 0, 0];
  const info = { forced: null, soft: {} };
  for (const t of PITY_TIERS) {
    q[TIER_IDX[t]] = tierChance(def, t, counters[t] || 0, base);
    const cfg = def.pity[t];
    if (cfg) {
      const n = (counters[t] || 0) + 1;
      if (n >= cfg.hard) info.forced = t;      // PITY_TIERS ascend, so the last one set is the highest
      info.soft[t] = n > cfg.soft;
    }
  }
  q[3] = Math.max(q[3], q[4]);
  q[2] = Math.max(q[2], q[3]);
  const probs = new Array(5).fill(0);
  probs[4] = q[4];
  probs[3] = q[3] - q[4];
  probs[2] = q[2] - q[3];
  const rest = Math.max(0, 1 - q[2]);
  const low = base[0] + base[1];
  if (low > 0) { probs[0] = rest * base[0] / low; probs[1] = rest * base[1] / low; }
  if (minIdx > 0) {
    let s = 0;
    for (let i = 0; i < 5; i++) { if (i < minIdx) probs[i] = 0; s += probs[i]; }
    if (s > 0) for (let i = 0; i < 5; i++) probs[i] /= s;
  }
  return { probs, ...info };
}

function mixFor(def, rarity) {
  const m = def.mix[rarity];
  const kinds = ['cat', 'card', 'relic', 'yarn', 'gems'];
  const w = kinds.map((k) => {
    if (k === 'gems') return def.gems[rarity] > 0 ? m.gems : 0;
    if (k === 'yarn') return def.yarn[rarity] > 0 ? m.yarn : 0;
    return POOL[k][rarity].length ? m[k] : 0;
  });
  const s = w.reduce((a, b) => a + b, 0);
  return { kinds, w: w.map((x) => x / s) };
}

/**
 * oddsTable(crateId, profile) -> everything the UI prints, all of it the numbers openCrate rolls on.
 *   rarity[i]: {id, base, now}  base = row of the crate (after perk), now = next pull incl. pity (fractions)
 *   content[rarity]: {cat, card, relic, yarn, gems} fractions given that rarity
 *   pools[rarity]: item counts; item[rarity]: chance of one specific cat/card/relic given the rarity
 *   pity[tier]: {soft, hard, counter, remaining, chanceNow} or null
 *   multi: {count, guarantee, slotProbs}, golden, price {cur, price, opens}, luck {level, mult}
 */
export function oddsTable(crateId, profile) {
  const def = CRATE_BY_ID[crateId];
  if (!def) throw new Error('oddsTable: unknown crate ' + crateId);
  const luck = luckLevel(profile);
  const counters = pityCounters(profile, crateId);
  const base = baseProbs(def, luck);
  const r = rarityProbs(def, counters, luck);
  const opens = Math.max(0, ((profile && profile.stats && profile.stats.crateOpens) | 0));
  const price = crateCost(crateId, opens);
  const content = {}, pools = {}, item = {};
  for (const id of RARITY_IDS) {
    const m = mixFor(def, id);
    content[id] = Object.fromEntries(m.kinds.map((k, i) => [k, m.w[i]]));
    pools[id] = { cat: POOL.cat[id].length, card: POOL.card[id].length, relic: POOL.relic[id].length };
    item[id] = {
      cat: pools[id].cat ? content[id].cat / pools[id].cat : 0,
      card: pools[id].card ? content[id].card / pools[id].card : 0,
      relic: pools[id].relic ? content[id].relic / pools[id].relic : 0,
    };
  }
  const pity = {};
  for (const t of PITY_TIERS) {
    const cfg = def.pity[t];
    pity[t] = cfg ? {
      soft: cfg.soft, hard: cfg.hard, counter: counters[t],
      remaining: Math.max(0, cfg.hard - counters[t]),
      chanceNow: tierChance(def, t, counters[t], base),
    } : null;
  }
  const gIdx = RARITY_IDS.indexOf(def.multi.guarantee);
  const slot = rarityProbs(def, counters, luck, gIdx).probs;
  return {
    crateId, name: def.name, tier: def.tier, blurb: def.blurb,
    rarity: RARITY_IDS.map((id, i) => ({ id, base: base[i], now: r.probs[i] })),
    content, pools, item, pity,
    yarn: def.yarn, gems: def.gems,
    golden: def.golden,
    multi: { count: def.multi.count, guarantee: def.multi.guarantee, slotProbs: slot },
    price: { cur: price.cur, price: price.price, opens },
    luck: { level: luck, mult: 1 + LUCK_PER_LEVEL * luck },
    forced: r.forced,
  };
}

// ------------------------------------------------------------------ analytics (docs and tests)

/** Expected pulls from counter 0 to the first drop of `tier` or better (pity included, other tiers ignored). */
export function expectedPulls(crateId, tier, luck = 0) {
  const def = CRATE_BY_ID[crateId];
  const base = baseProbs(def, luck);
  const idx = TIER_IDX[tier];
  let tail = 0;
  for (let i = idx; i < 5; i++) tail += base[i];
  const cfg = def.pity[tier];
  if (!cfg) return tail > 0 ? 1 / tail : Infinity;
  let surv = 1, e = 0;
  for (let c = 0; c < cfg.hard; c++) { e += surv; surv *= 1 - tierChance(def, tier, c, base); }
  return e;
}

/** Worst case yarn and gems per pull, assuming EVERY item is a duplicate (golden included). */
export function expectedReturn(crateId, luck = 0) {
  const def = CRATE_BY_ID[crateId];
  const p = baseProbs(def, luck);
  let yarn = 0, gems = 0;
  RARITY_IDS.forEach((r, i) => {
    const m = mixFor(def, r);
    const d = DUPE_YARN[r];
    const v = m.w[0] * d * DUPE_SHARE.cat + m.w[1] * d * DUPE_SHARE.card + m.w[2] * d * DUPE_SHARE.relic
      + m.w[3] * def.yarn[r];
    yarn += p[i] * v;
    gems += p[i] * m.w[4] * def.gems[r];
  });
  const g = 1 + def.golden;
  return { yarn: yarn * g, gems: gems * g };
}

// ------------------------------------------------------------------ helpers

export function starsForDupes(dupes) {
  let s = 0;
  for (let i = 0; i < MAX_STARS; i++) if (dupes >= STAR_DUPES[i]) s = i + 1;
  return s;
}

function addCur(p, cur, n) { p.cur[cur] = money((p.cur[cur] || 0) + n); }

function ensure(profile) {
  const p = structuredClone(profile);
  p.cur = p.cur || {};
  p.cats = p.cats || {};
  p.cards = p.cards || {};
  p.relics = p.relics || {};
  p.pity = p.pity || {};
  p.stats = p.stats || {};
  return p;
}

function pickFromCum(probs, u) {
  let acc = 0, last = 0;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > 0) last = i;
    acc += probs[i];
    if (u < acc) return i;
  }
  return last;
}

function applyDrop(p, def, kind, rarity, rng, golden) {
  const mul = golden ? 2 : 1;
  const d = { kind, id: '', rarity, isNew: false, dupeValue: 0, golden };
  if (kind === 'yarn' || kind === 'gems') {
    const amount = (kind === 'yarn' ? def.yarn[rarity] : def.gems[rarity]) * mul;
    d.id = kind; d.amount = amount;
    addCur(p, kind, amount);
    return d;
  }
  const pool = POOL[kind][rarity];
  const id = pool[rng.int(0, pool.length - 1)];
  d.id = id;
  const dupeYarn = DUPE_YARN[rarity] * DUPE_SHARE[kind] * mul;
  if (kind === 'cat') {
    let e = p.cats[id];
    if (!e) {
      e = p.cats[id] = { level: 1, dupes: 0, stars: 0 };
      d.isNew = true;
      if (!p.cards['call_' + id]) p.cards['call_' + id] = { level: 1, count: 1 };
      if (golden) { e.dupes += 1; }          // golden new cat starts with star 1
      d.dupeValue = 0;
    } else {
      e.dupes = (e.dupes | 0) + 1 + (golden ? 1 : 0);
      d.dupeValue = Math.round(dupeYarn);
      addCur(p, 'yarn', d.dupeValue);
    }
    const stars = Math.max(e.stars | 0, starsForDupes(e.dupes | 0));
    d.starsGained = stars - (e.stars | 0);
    e.stars = stars;
    d.stars = stars;
  } else if (kind === 'card') {
    const e = p.cards[id];
    if (!e) {
      p.cards[id] = { level: 1, count: 1 + (golden ? 1 : 0) };
      d.isNew = true;
    } else {
      e.count = (e.count | 0) + 1 + (golden ? 1 : 0);
      d.dupeValue = Math.round(dupeYarn);
      addCur(p, 'yarn', d.dupeValue);
    }
    d.count = p.cards[id].count;
  } else {
    if (!p.relics[id]) {
      p.relics[id] = true;
      d.isNew = true;
      if (golden) { d.dupeValue = Math.round(DUPE_YARN[rarity]); addCur(p, 'yarn', d.dupeValue); }
    } else {
      d.dupeValue = Math.round(dupeYarn);
      addCur(p, 'yarn', d.dupeValue);
    }
  }
  return d;
}

// ------------------------------------------------------------------ reveal beats (cosmetic metadata)

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function makeReveal(def, drop, rng) {
  const rv = def.reveal;
  const i = RARITY_IDS.indexOf(drop.rarity);
  const tell = clamp01(rv.tellBase + 0.17 * i + (rng.next() - 0.5) * 0.2);
  const fake = i < 4 && rng.next() < rv.fakeOutChance;
  const beats = [];
  let at = 0;
  beats.push({ kind: 'shake', at, power: +(0.25 + 0.12 * i).toFixed(2) });
  at += rv.shakeMs * 0.4;
  if (tell > 0.3) { beats.push({ kind: 'rumble', at, power: +tell.toFixed(2) }); at += rv.shakeMs * 0.3; }
  if (fake) {
    // Near miss: the light leaks in the colour of the NEXT rarity, then fades to the true one.
    beats.push({ kind: 'crack', at, color: RARITY_IDS[i + 1], hint: 'tease' });
    at += rv.openMs * 0.4;
    beats.push({ kind: 'fakeout', at, from: RARITY_IDS[i + 1], to: drop.rarity });
    at += rv.openMs * 0.3;
  } else if (tell > 0.45) {
    beats.push({ kind: 'crack', at, color: drop.rarity, hint: 'true' });
    at += rv.openMs * 0.4;
  }
  if (i >= 2) { beats.push({ kind: 'pulse', at, color: drop.rarity, power: +(0.4 + 0.15 * i).toFixed(2) }); at += rv.openMs * 0.3; }
  if (drop.golden) { beats.push({ kind: 'flash', at, color: 'gold', power: 1 }); at += rv.openMs * 0.2; }
  else if (i >= 3) { beats.push({ kind: 'flash', at, color: drop.rarity, power: 0.8 }); at += rv.openMs * 0.2; }
  if (i >= 1) beats.push({ kind: 'burst', at, color: drop.rarity, power: +(0.3 + 0.18 * i).toFixed(2) });
  beats.push({ kind: 'reveal', at: at + 60, color: drop.rarity });
  return { tell: +tell.toFixed(3), fakeOut: fake, beats, ms: Math.round(at + 60 + rv.perDropMs) };
}

// ------------------------------------------------------------------ opening

/**
 * openCrate(profile, crateId, rng, opts) -> {profile, drops, pityHit, reveal, spent, count} or, when the
 * player cannot pay, {profile (unchanged copy), drops: [], pityHit: null, error: 'cant_afford', need, have, cur}.
 *   opts.count : 1 (default) or 10 (the x10 button, with its guarantee)
 *   opts.free  : true skips payment (rewards, tests); price creep and opens are not touched either
 *   opts.useKey: true pays with Crate Workshop keys instead of currency: one key (profile.town.keys[crateId]) per
 *                open, no currency cost, no price creep; pity and cratesTotal count as usual. Too few keys gives
 *                {error: 'no_key', need, have, crate} and an unchanged profile copy.
 * Each drop: {kind:'cat'|'card'|'relic'|'yarn'|'gems', id, rarity, isNew, dupeValue, golden, reveal,
 *   amount? (currency), stars?/starsGained? (cats), count? (cards), pity?: 'hard'|'soft'}.
 * pityHit: null or {tier, pull, hard: true} for the best pull in the batch that a hard guarantee delivered.
 * The input profile is never mutated.
 */
export function openCrate(profile, crateId, rng, opts = {}) {
  const def = CRATE_BY_ID[crateId];
  if (!def) throw new Error('openCrate: unknown crate ' + crateId);
  const count = opts.count === MULTI_COUNT ? MULTI_COUNT : 1;
  const p = ensure(profile);
  const luck = luckLevel(p);
  const opens = Math.max(0, p.stats.crateOpens | 0);

  let spent = { cur: null, amount: 0 };
  if (opts.useKey && !opts.free) {
    const keys = (p.town && p.town.keys) || {};
    const have = Math.max(0, Math.floor(Number(keys[crateId]) || 0));
    if (have < count) return { profile: p, drops: [], pityHit: null, error: 'no_key', need: count, have, crate: crateId };
    p.town = { ...p.town, keys: { ...keys, [crateId]: have - count } };
    if (!p.town.keys[crateId]) delete p.town.keys[crateId];
    spent = { cur: 'key', amount: count };
  } else if (!opts.free) {
    let total = 0, cur = null;
    for (let i = 0; i < count; i++) { const c = crateCost(crateId, opens + i); total += c.price; cur = c.cur; }
    const have = p.cur[cur] || 0;
    if (have < total) return { profile: p, drops: [], pityHit: null, error: 'cant_afford', need: total, have, cur };
    p.cur[cur] = money(have - total);
    spent = { cur, amount: total };
    p.stats.crateOpens = opens + count;
  }
  p.stats.cratesTotal = (p.stats.cratesTotal | 0) + count;

  const gIdx = RARITY_IDS.indexOf(def.multi.guarantee);
  const drops = [];
  let pityHit = null;
  let sawGuarantee = false;

  for (let n = 0; n < count; n++) {
    const counters = pityCounters(p, crateId, false);   // stored values
    const credited = pityCounters(p, crateId, true);    // plus the workshop credit, for the odds only
    const needSlot = count === MULTI_COUNT && n === count - 1 && !sawGuarantee;
    const r = rarityProbs(def, credited, luck, needSlot ? gIdx : 0);
    const ri = pickFromCum(r.probs, rng.next());
    const rarity = RARITY_IDS[ri];
    const m = mixFor(def, rarity);
    const kind = m.kinds[pickFromCum(m.w, rng.next())];
    const golden = rng.next() < def.golden;
    const drop = applyDrop(p, def, kind, rarity, rng, golden);
    drop.slot = n;
    if (needSlot) drop.guarantee = true;
    if (ri >= gIdx) sawGuarantee = true;

    // pity bookkeeping
    for (const t of PITY_TIERS) {
      if (!def.pity[t]) continue;
      const key = pityKey(crateId, t);
      p.pity[key] = ri >= TIER_IDX[t] ? 0 : (counters[t] + 1);
    }
    if (r.forced && ri === TIER_IDX[r.forced]) {
      drop.pity = 'hard';
      if (!pityHit || TIER_IDX[r.forced] >= TIER_IDX[pityHit.tier]) pityHit = { tier: r.forced, pull: n, hard: true };
    } else if (r.soft[rarity] && ri >= 2) {
      drop.pity = 'soft';
    }
    drops.push(drop);
  }

  // Cosmetics are drawn AFTER every result is final, so they cannot influence a single outcome.
  for (const d of drops) d.reveal = makeReveal(def, d, rng);
  const order = drops.map((_, i) => i).sort((a, b) => {
    const ra = RARITY_IDS.indexOf(drops[a].rarity), rb = RARITY_IDS.indexOf(drops[b].rarity);
    return ra - rb || a - b;
  });
  let best = 0;
  drops.forEach((d, i) => { if (RARITY_IDS.indexOf(d.rarity) >= RARITY_IDS.indexOf(drops[best].rarity)) best = i; });
  const totalMs = drops.reduce((s, d) => s + d.reveal.ms, 0);

  return { profile: p, drops, pityHit, reveal: { order, finale: best, totalMs }, spent, count };
}
