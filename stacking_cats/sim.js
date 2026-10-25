// Stacking Cats: pure simulation. No DOM, deterministic for a given seed.
// The renderer reads the state and drains g.ev (visual and sound events).
import {
  CATS, CAT_BY_ID, STARTERS, SNACKS, SNACK_BY_ID, ENEMY_TYPES, NESTS,
  MAX_STACK, MAX_BENCH, BOSS_EVERY, LVL_MUL, AURA_MUL, BASE_HP, BASE_DMG, TEMP_WAVES,
  ITEMS, ITEM_BY_ID, ITEM_WEIGHT, MAX_STASH, SELL_VALUE, FORGE_NEXT, FORGE_COUNT, SPECIALS, SPECIAL_TIME, EVENTS, itemSlots, kingdomBonuses, emptyKingdom, COIN,
  DIFFS, CAT_TAGS, SYNERGIES, ROUTES, ROUTE_BY_ID, DAILY_POOL, masteryBonus,
} from './cats.js';

export const W = 960, H = 540, GROUND = 440, TOWER_X = 170, SLOT = 56, DT = 1 / 30;
export const MAX_ENEMIES = 34;

// Difficulty knobs (the balance test keeps these honest).
export const TUNE = {
  hpA: 0.14, hpB: 0.006,        // enemy hp scale per wave
  dmgA: 0.065, dmgB: 0.002,     // enemy damage scale per wave
  budgetA: 3, budgetB: 2.6, budgetC: 0.06,
  nestHp: 650, nestGrow: 1.4,
  healAfter: 0.4,
};

export function rngMaker(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const waveScale = (w) => {
  const n = w - 1;
  return { hp: 1 + TUNE.hpA * n + TUNE.hpB * n * n, dmg: 1 + TUNE.dmgA * n + TUNE.dmgB * n * n };
};

export function newGame({ seed = 1, unlocked = STARTERS, events = true, kingdom = null, difficulty = 'normal', daily = null, mastery = null } = {}) {
  if (daily) { kingdom = null; unlocked = DAILY_POOL; seed = daily.seed; difficulty = 'normal'; }
  const meta = kingdomBonuses(kingdom || emptyKingdom());
  return {
    focus: 0, fortressT: 0, anthemT: 0, hexT: 0, phaseT: 0, event: null, eventsSeen: 0, hurtMul: 1,
    meta, mastery: daily ? null : mastery, rerolls: Math.max(0, meta.rerolls - ((DIFFS[difficulty] || DIFFS.normal).rerolls || 0)), diff: DIFFS[difficulty] || DIFFS.normal, route: ROUTE_BY_ID.trail, daily, zoomMax: 6 + meta.zoomDur, stash: [], chests: 0, curCat: null, report: null, wTaken: 0, wKills: 0, wCoins: 0, wDmg0: 0, wT0: 0,
    seed, rnd: rngMaker(seed), events, ev: [], unlocked: new Set(unlocked),
    t: 0, wave: 0, state: 'idle', intro: 0, bossWave: false, reward: [],
    cats: [], bench: [], enemies: [], projs: [], pools: [], mines: [],
    towerX: TOWER_X, scroll: 0, perm: [], temp: [], nineLives: meta.nine, uid: 1,
    zoom: meta.zoomStart, zoomT: 0, queue: [], qT: 0, waveKO: false, mods: null, tickT: 0,
    run: { diff: difficulty, daily: daily ? daily.day : null, synMax: 0, nine: 0, kills: 0, bossKills: 0, recruits: 0, merges: 0, lvl3: 0, lvl3Of: {}, snacks: 0, temp: 0, flawless: 0, wave: 0, coins: 0, dmg: 0, biggest: 0, taken: 0, healed: 0, items: 0, byCat: {} },
  };
}

export const stackMax = (g) => (g.daily && g.daily.mod.stack) || MAX_STACK;
export const benchMax = (g) => MAX_BENCH + g.meta.bench;
const emit = (g, e) => { if (g.events) g.ev.push(e); };
const rnd = (g) => g.rnd();
const pick = (g, arr) => arr[Math.floor(g.rnd() * arr.length)];

// ---------------------------------------------------------------- stats
export function calcMods(g) {
  const K = g.meta;
  const m = { dmg: K.dmg, haste: K.haste, crit: 0.05 + K.crit, critMul: 1.8, dr: 0, hp: K.hp, range: K.range, slow: 0, curse: 0, waveHeal: TUNE.healAfter + K.waveHeal, snackMul: 1, coin: 1 + K.coinMul };
  for (const c of g.cats.concat(g.bench)) m.coin += itemFx(c).coin;
  if (g.daily) { m.dmg += g.daily.mod.dmg || 0; m.hp += g.daily.mod.hp || 0; }
  m.regenTeam = 0;
  m.mastery = g.mastery || null;
  m.syn = synergyState(g);
  for (const t in m.syn.tiers) {
    const team = SYNERGIES[t].tiers[m.syn.tiers[t] - 1].team;
    if (team) for (const k in team) { if (k === 'regen') m.regenTeam += team[k]; else m[k] += team[k]; }
  }
  for (const c of g.cats) {
    if (c.ko) continue;
    const p = CAT_BY_ID[c.id].pas;
    if (!p) continue;
    const a = AURA_MUL[c.lvl - 1];
    if (p.haste) m.haste += p.haste * a;
    if (p.dmg) m.dmg += p.dmg * a;
    if (p.curse) m.curse += p.curse * a;
    if (p.dr) m.dr += p.dr * a;
    if (p.snack) m.snackMul += p.snack * a;
  }
  const apply = (id) => {
    const s = SNACK_BY_ID[id];
    for (const k in s.fx) m[k] += s.fx[k] * m.snackMul;
  };
  for (const id of g.perm) apply(id);
  for (const t of g.temp) apply(t.id);
  if (g.zoomT > 0) { m.haste += 1.0; m.dmg += 0.2; }
  if (g.hexT > 0) m.curse += 0.35;
  m.dr = Math.min(0.65, m.dr);
  m.slow = Math.min(0.6, m.slow);
  return m;
}

const FX_KEYS = ['dmg', 'haste', 'hp', 'crit', 'critMul', 'range', 'ls', 'dr', 'regen', 'thorns', 'berserk', 'extra', 'burn', 'slow', 'stun', 'coin'];
// the summed effect of a cat's equipped items (cached on the cat)
export function fxOf(items) {
  const f = {};
  for (const k of FX_KEYS) f[k] = 0;
  for (const id of items) { const it = ITEM_BY_ID[id]; if (it) for (const k in it.fx) f[k] += it.fx[k]; }
  return f;
}
export function itemFx(c) {
  const sig = c.items.join(',');
  if (c._sig !== sig) { c._sig = sig; c._fx = fxOf(c.items); }
  return c._fx;
}
export function synergyState(g) {
  const counts = {}, tiers = {};
  for (const c of g.cats) if (!c.ko) for (const t of CAT_TAGS[c.id] || []) counts[t] = (counts[t] || 0) + 1;
  for (const t in counts) { const tier = counts[t] >= 3 ? 2 : counts[t] >= 2 ? 1 : 0; if (tier) tiers[t] = tier; }
  return { counts, tiers };
}
// item effects plus this cat's synergy bonuses, cached per mods object
function mkFx(mods, c, items) {
  const f = fxOf(items);
  f.regen += mods.regenTeam || 0;
  const mlv = mods.mastery && mods.mastery[c.id];   // cat mastery: a tiny permanent bonus for this cat only
  if (mlv > 1) { const mb = masteryBonus(mlv); f.dmg += mb.dmg; f.hp += mb.hp; }
  const syn = mods.syn;
  if (syn) for (const t of CAT_TAGS[c.id] || []) {
    const tier = syn.tiers[t];
    const self = tier && SYNERGIES[t].tiers[tier - 1].self;
    if (self) for (const k in self) f[k] += self[k];
  }
  return f;
}
export function cfx(mods, c) {
  const cache = mods._cf || (mods._cf = new Map());
  let f = cache.get(c.uid);
  if (!f) { f = mkFx(mods, c, c.items); cache.set(c.uid, f); }
  return f;
}
export function catMaxHp(g, c, mods = g.mods || calcMods(g)) {
  return Math.round(BASE_HP * CAT_BY_ID[c.id].hp * LVL_MUL[c.lvl - 1] * (1 + mods.hp + cfx(mods, c).hp));
}
export function catDmg(c, mods, mult = 1) {
  const f = cfx(mods, c);
  return BASE_DMG * CAT_BY_ID[c.id].atk.dmg * LVL_MUL[c.lvl - 1] * (1 + mods.dmg + f.dmg + (c.train || 0) + (c.low ? f.berserk : 0)) * mult;
}
// rough damage per second, used for the previews in the menus
export function estDps(c, mods, items = c.items) {
  const a = CAT_BY_ID[c.id].atk, fx = mkFx(mods, c, items);
  const crit = 1 + Math.min(1, mods.crit + fx.crit + (a.crit || 0)) * (mods.critMul + fx.critMul - 1);
  const per = BASE_DMG * a.dmg * LVL_MUL[c.lvl - 1] * (1 + mods.dmg + fx.dmg + (c.train || 0)) * crit;
  const shots = {
    melee: a.pierce ? 2.2 : 1 + 0.6 * (a.cleave || 0), cone: 2.2, chain: 1 + 0.6 * a.jumps, beam: 2, strike: 1.5, nova: 3, mine: 1.8, storm: (a.stars || 1) * 1.2,
    spread: (a.pellets || 1) * 0.85, lob: 1.8, proj: (a.count || 1) * (a.burst || 1) * (1 + 0.3 * (a.pierce || 0)) * (a.splash ? 1.5 : 1),
  }[a.t] || 1;
  return (per * shots * (1 + 0.4 * fx.extra) * (1 + mods.haste + fx.haste)) / a.cd;
}
export const aliveCats = (g) => g.cats.filter((c) => !c.ko);

export function makeCat(g, id, lvl = 1) {
  const c = { uid: g.uid++, id, lvl, hp: 1, ko: false, cd: 0.3 + g.rnd() * 0.4, scd: 1, burst: 0, burstT: 0, shots: 0, flash: 0, atk: 0, revUsed: false, items: [], low: false, dmgDone: 0, healDone: 0, kills: 0, taken: 0, wDmg: 0, wKills: 0, wHeal: 0, sp: 0.3, frenzyT: 0 };
  c.hp = catMaxHp(g, c, calcMods(g));
  return c;
}

// ---------------------------------------------------------------- roster management
const allCats = (g) => g.cats.concat(g.bench);
export const findCat = (g, uid) => allCats(g).find((c) => c.uid === uid);

function refreshHp(g, before) {
  // keep hp in step with max hp changes (snacks, merges)
  const now = calcMods(g);
  for (const c of g.cats.concat(g.bench)) {
    const b = before.get(c.uid);
    const mx = catMaxHp(g, c, now);
    c.hp = Math.min(mx, c.hp + Math.max(0, mx - (b || mx)));
  }
  g.mods = now;
}
function snapshotMax(g) {
  const m = calcMods(g);
  const map = new Map();
  for (const c of allCats(g)) map.set(c.uid, catMaxHp(g, c, m));
  return map;
}

function bumpMerge(g, c) {
  g.run.merges++;
  if (c.lvl === 3) { g.run.lvl3++; g.run.lvl3Of[c.id] = true; }
}

// Merge b into a (same id, same level, below max).
export function mergeCats(g, aUid, bUid) {
  const a = findCat(g, aUid), b = findCat(g, bUid);
  if (!a || !b || a === b || a.id !== b.id || a.lvl !== b.lvl || a.lvl >= 3) return false;
  const ratio = (a.hp / catMaxHp(g, a) + b.hp / catMaxHp(g, b)) / 2;
  const rm = (arr) => { const i = arr.indexOf(b); if (i >= 0) arr.splice(i, 1); };
  rm(g.cats); rm(g.bench);
  a.lvl++;
  a.items = a.items.concat(b.items);
  while (a.items.length > itemSlots(a.lvl)) stashItem(g, a.items.pop());
  for (const k of ['dmgDone', 'healDone', 'kills', 'taken', 'wDmg', 'wKills', 'wHeal']) a[k] += b[k];
  a.ko = a.ko && b.ko;
  a.hp = Math.max(1, Math.round(catMaxHp(g, a) * Math.min(1, ratio + 0.15)));
  bumpMerge(g, a);
  emit(g, { k: 'merge', uid: a.uid });
  // cascade, e.g. two lvl2 already present
  const other = allCats(g).find((x) => x !== a && x.id === a.id && x.lvl === a.lvl && a.lvl < 3);
  if (other) mergeCats(g, other.uid, a.uid);
  return true;
}

// Add a new lvl1 cat: auto-merges with an equal one, else tower, else bench, else refuses.
export function addCat(g, id) {
  g.run.recruits++;
  const c = makeCat(g, id);
  const twin = allCats(g).find((x) => x.id === id && x.lvl === 1);
  if (twin) {
    g.cats.push(c);
    mergeCats(g, twin.uid, c.uid);
    return { ok: true, merged: true, cat: twin };
  }
  if (g.cats.length < stackMax(g)) { g.cats.push(c); return { ok: true, cat: c }; }
  if (g.bench.length < benchMax(g)) { g.bench.push(c); return { ok: true, cat: c, benched: true }; }
  g.run.recruits--;
  return { ok: false, cat: c };
}

export function releaseCat(g, uid) {
  for (const arr of [g.cats, g.bench]) {
    const i = arr.findIndex((c) => c.uid === uid);
    if (i >= 0) { for (const id of arr[i].items) stashItem(g, id); arr.splice(i, 1); return true; }
  }
  return false;
}

// ---------------------------------------------------------------- items and loot
export function stashItem(g, id) { g.stash.push(id); return true; }
export function rollItemChoices(g, n = 3) {
  const L = g.meta.luck + g.route.rare, pool = ITEMS.map((it) => ({ id: it.id, w: ITEM_WEIGHT[it.rarity] * (it.rarity === 'rare' ? 1 + 0.25 * L : it.rarity === 'epic' ? 1 + 0.5 * L : 1) }));
  const out = [];
  while (out.length < n && pool.length) {
    let r = g.rnd() * pool.reduce((a, b) => a + b.w, 0), i = 0;
    while (r > pool[i].w && i < pool.length - 1) { r -= pool[i].w; i++; }
    out.push(pool.splice(i, 1)[0].id);
  }
  return out;
}
// a pick is never refused: the pack may overflow, and the arrange screen then asks the player to sell, forge or equip
// until it fits again (selling always works, so the pack can never lock the run)
export function takeItem(g, id) { g.run.items++; g.stash.push(id); return true; }
export const overflow = (g) => Math.max(0, g.stash.length - MAX_STASH);
export const sellValue = (g, id) => Math.round(SELL_VALUE[ITEM_BY_ID[id].rarity] * (1 + 0.04 * g.wave));
export function sellItem(g, idx) {
  const id = g.stash[idx];
  if (!id) return 0;
  const v = sellValue(g, id);
  g.stash.splice(idx, 1);
  addCoins(g, v);
  g.run.sold = (g.run.sold || 0) + 1;
  return v;
}
// indexes of the items that forging item `idx` would use: the item itself plus two more of its rarity, equal items first
export function forgePlan(g, idx) {
  const id = g.stash[idx];
  if (!id) return null;
  const rar = ITEM_BY_ID[id].rarity, rest = [];
  g.stash.forEach((o, i) => { if (i !== idx && ITEM_BY_ID[o].rarity === rar) rest.push(i); });
  rest.sort((a, b) => (g.stash[b] === id) - (g.stash[a] === id));
  return rest.length >= FORGE_COUNT - 1 ? [idx, ...rest.slice(0, FORGE_COUNT - 1)] : null;
}
export function forgeItems(g, idx) {
  const plan = forgePlan(g, idx);
  if (!plan) return null;
  const rar = ITEM_BY_ID[g.stash[idx]].rarity, next = FORGE_NEXT[rar], used = plan.map((i) => g.stash[i]);
  const pool = ITEMS.filter((it) => it.rarity === next && !(rar === 'epic' && used.includes(it.id)));
  const pick = (pool.length ? pool : ITEMS.filter((it) => it.rarity === next))[Math.floor(g.rnd() * (pool.length || 1))] || ITEMS.find((it) => it.rarity === next);
  for (const i of plan.slice().sort((a, b) => b - a)) g.stash.splice(i, 1);
  g.stash.push(pick.id);
  g.run.forged = (g.run.forged || 0) + 1;
  if (rar === 'epic') addCoins(g, Math.round(40 * (1 + 0.04 * g.wave)));
  return pick.id;
}
export function equipItem(g, stashIdx, catUid) {
  const c = findCat(g, catUid), id = g.stash[stashIdx];
  if (!c || !id) return false;
  const before = snapshotMax(g);
  g.stash.splice(stashIdx, 1);
  if (c.items.length >= itemSlots(c.lvl)) g.stash.push(c.items.shift());
  c.items.push(id);
  refreshHp(g, before);
  return true;
}
export function unequipItem(g, catUid, idx) {
  const c = findCat(g, catUid);
  if (!c || !c.items[idx] || g.stash.length >= MAX_STASH) return false;
  const before = snapshotMax(g);
  g.stash.push(c.items.splice(idx, 1)[0]);
  refreshHp(g, before);
  return true;
}
export function useReroll(g) { if (g.rerolls <= 0) return false; g.rerolls--; return true; }

// where each team bonus comes from, for the stats panel
export function explainMods(g) {
  const rows = {};
  const add = (stat, label, v) => { if (v) (rows[stat] = rows[stat] || []).push({ label, v }); };
  const K = g.meta, sm = calcMods(g).snackMul;
  for (const k of ['dmg', 'hp', 'haste', 'range', 'crit', 'waveHeal']) add(k, 'Kingdom', K[k]);
  for (const id of g.perm) { const s = SNACK_BY_ID[id]; for (const k in s.fx) add(k, s.name, s.fx[k] * sm); }
  for (const t of g.temp) { const s = SNACK_BY_ID[t.id]; for (const k in s.fx) add(k, s.name + ' (' + t.left + 'w)', s.fx[k] * sm); }
  for (const c of g.cats) {
    const p = CAT_BY_ID[c.id].pas;
    if (!p || c.ko) continue;
    const a = AURA_MUL[c.lvl - 1];
    for (const k of ['haste', 'dmg', 'curse', 'dr']) add(k, CAT_BY_ID[c.id].name, (p[k] || 0) * a);
  }
  if (g.zoomT > 0) { add('haste', 'Zoomies', 1.0); add('dmg', 'Zoomies', 0.2); }
  return rows;
}

export function swapCats(g, aUid, bUid) {
  const loc = (u) => { for (const arr of [g.cats, g.bench]) { const i = arr.findIndex((c) => c.uid === u); if (i >= 0) return [arr, i]; } return null; };
  const A = loc(aUid), B = loc(bUid);
  if (!A || !B || aUid === bUid) return false;
  const t = A[0][A[1]]; A[0][A[1]] = B[0][B[1]]; B[0][B[1]] = t;
  return true;
}

export function moveCat(g, uid, to) {
  const c = findCat(g, uid);
  if (!c) return false;
  const from = g.cats.includes(c) ? g.cats : g.bench;
  const dest = to === 'tower' ? g.cats : g.bench;
  if (from === dest) return false;
  if (dest.length >= (to === 'tower' ? stackMax(g) : benchMax(g))) return false;
  from.splice(from.indexOf(c), 1);
  dest.push(c);
  return true;
}

export function mergePairs(g) {
  const out = [];
  const list = allCats(g);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (list[i].id === list[j].id && list[i].lvl === list[j].lvl && list[i].lvl < 3) out.push([list[i].uid, list[j].uid]);
  }
  return out;
}

// ---------------------------------------------------------------- choices
export function rollCatChoices(g, n = 3) {
  const pool = [...g.unlocked];
  const owned = new Set(allCats(g).map((c) => c.id));
  const picks = [];
  while (picks.length < n && pool.length) {
    const w = pool.map((id) => 1 + (owned.has(id) ? 0.8 : 0));
    let r = g.rnd() * w.reduce((a, b) => a + b, 0), i = 0;
    while (r > w[i] && i < w.length - 1) { r -= w[i]; i++; }
    picks.push(pool.splice(i, 1)[0]);
  }
  return picks;
}

export function snackChoiceCount(g) {
  return Math.max(2, 3 - (g.diff.snack || 0)) + g.route.snackExtra + g.cats.concat(g.bench).reduce((n, c) => n + (CAT_BY_ID[c.id].pas && CAT_BY_ID[c.id].pas.snackPick ? 1 : 0), 0);
}

export function rollSnackChoices(g, n = snackChoiceCount(g)) {
  const pool = SNACKS.filter((s) => !(s.rare && (g.nineLives > 0 || g.rnd() < 0.7)));
  const picks = [];
  while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(g.rnd() * pool.length), 1)[0].id);
  return picks;
}

export function eatSnack(g, id) {
  const s = SNACK_BY_ID[id];
  const before = snapshotMax(g);
  g.run.snacks++;
  if (s.kind === 'temp') {
    g.run.temp++;
    const ex = g.temp.find((t) => t.id === id);
    if (ex) ex.left = TEMP_WAVES; else g.temp.push({ id, left: TEMP_WAVES });
  } else if (s.kind === 'perm') {
    g.perm.push(id);
    if (s.nine) g.nineLives++;
  } else if (s.heal) {
    for (const c of g.cats.concat(g.bench)) c.hp = Math.min(catMaxHp(g, c), c.hp + catMaxHp(g, c) * s.heal * (g.mods || calcMods(g)).snackMul);
  }
  refreshHp(g, before);
}

// ---------------------------------------------------------------- waves
const isBossWave = (w) => w % BOSS_EVERY === 0;
export const stageOf = (w) => Math.ceil(w / BOSS_EVERY);

function buildQueue(g, w) {
  const boss = isBossWave(w);
  let budget = TUNE.budgetA + TUNE.budgetB * w + TUNE.budgetC * w * w;
  if (boss) budget *= 0.45;
  budget *= g.diff.budget * g.route.budget * ((g.daily && g.daily.mod.budget) || 1);
  const types = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k].minWave <= w);
  const q = [];
  let t = 0;
  const gap = Math.max(0.38, 1.05 - w * 0.02);
  while (budget > 0.5) {
    const ok = types.filter((k) => ENEMY_TYPES[k].cost <= budget);
    if (!ok.length) break;
    const wts = ok.map((k) => ENEMY_TYPES[k].wt * (ENEMY_TYPES[k].minWave > w - 3 ? 1.5 : 1));
    let r = g.rnd() * wts.reduce((a, b) => a + b, 0), i = 0;
    while (r > wts[i] && i < wts.length - 1) { r -= wts[i]; i++; }
    const type = ok[i];
    const elite = ((w >= 6 && g.rnd() < Math.min(0.22, (w - 5) * 0.018)) || (g.daily && g.daily.mod.elite && w >= 2 && g.rnd() < g.daily.mod.elite) || (g.diff.elite && w >= 3 && g.rnd() < g.diff.elite)) && ENEMY_TYPES[type].cost * 2.2 <= budget + 2;
    budget -= ENEMY_TYPES[type].cost * (elite ? 2.2 : 1);
    q.push({ t, type, elite });
    t += gap * (0.5 + g.rnd());
    if (g.rnd() < 0.18) t += 1.2; // little pauses give the waves a rhythm
  }
  return q;
}

export function makeEnemy(g, type, w, o = {}) {
  const d = ENEMY_TYPES[type], sc = waveScale(w), dm = (g.daily && g.daily.mod) || {};
  const elite = !!o.elite;
  const hp = d.hp * sc.hp * g.diff.hp * g.route.enemyHp * (dm.enemyHp || 1) * (elite ? 2.6 : 1);
  const spdMul = g.route.speed * (dm.speed || 1) * (g.diff.speed || 1);
  return {
    uid: g.uid++, type, x: o.x != null ? o.x : W + 40, y: GROUND + 4 + g.rnd() * 20, hp, maxHp: hp,
    dmg: d.dmg * sc.dmg * g.diff.dmg * g.route.enemyDmg * (elite ? 1.35 : 1), cd: d.cd * (0.4 + g.rnd() * 0.8), spd: d.spd * spdMul * (0.9 + g.rnd() * 0.2) * (elite ? 0.92 : 1),
    w: d.w * (elite ? 1.2 : 1), h: d.h * (elite ? 1.2 : 1), armor: d.armor || 0, ai: d.ai, range: d.range || 0,
    fly: d.ai === 'fly', alt: d.alt || 0, elite, flash: 0, stun: 0, slow: 0, slowT: 0, burn: null, poison: null,
    dead: false, swing: 0, t: g.rnd() * 6, ability: 0, boss: false, age: 0, kb: 0,
    shield: d.shield ? hp * d.shield : 0, maxShield: d.shield ? hp * d.shield : 0, under: d.ai === 'burrow', leapT: 0, leaped: false,
  };
}
const ecy = (e) => (e.fly ? e.y - e.alt : e.y - e.h * 0.5);

export function startWave(g) {
  g.wave++;
  g.run.wave = g.wave;
  g.state = 'intro';
  g.intro = 2.4;
  g.bossWave = isBossWave(g.wave);
  g.enemies = []; g.projs = []; g.pools = []; g.mines = [];
  g.towerX = TOWER_X;
  g.queue = buildQueue(g, g.wave);
  g.qT = 0;
  g.waveKO = false;
  g.zoomT = Math.min(g.zoomT, 0);
  g.wTaken = 0; g.wKills = 0; g.wCoins = 0; g.wDmg0 = g.run.dmg; g.wT0 = g.t;
  for (const c of g.cats.concat(g.bench)) { c.wDmg = 0; c.wKills = 0; c.wHeal = 0; }
  for (const c of g.cats) c.revUsed = false;
  if (g.bossWave) {
    const n = g.wave / BOSS_EVERY;
    const hp = TUNE.nestHp * Math.pow(TUNE.nestGrow, n - 1) * (1 + 0.08 * g.cats.length) * g.diff.hp * g.route.bossHp;
    const info = NESTS[(n - 1) % NESTS.length];
    const e = makeEnemy(g, 'mouse', g.wave, { x: 770 });
    Object.assign(e, { boss: true, ai: 'nest', type: 'nest', kind: info.id, name: info.name, hp, maxHp: hp, w: 150, h: 150, y: GROUND + 14, armor: 0.12, spd: 0, dmg: 0, ability: 0, spawnT: 2.5, bombT: 6, phase: 0, n });
    g.enemies.push(e);
  }
  g.mods = calcMods(g);
  emit(g, { k: 'wave', wave: g.wave, boss: g.bossWave });
}

function finishWave(g) {
  g.state = 'clear';
  const m = calcMods(g);
  const before = snapshotMax(g);
  for (const c of g.cats) {
    const mx = catMaxHp(g, c, m);
    if (c.ko) { c.ko = false; c.hp = Math.round(mx * (0.35 + g.meta.reviveHp)); } else c.hp = Math.min(mx, c.hp + mx * m.waveHeal * (g.diff.heal == null ? 1 : g.diff.heal));
  }
  for (const c of g.bench) c.hp = Math.min(catMaxHp(g, c, m), c.hp + catMaxHp(g, c, m) * 0.6);
  for (const t of g.temp) t.left--;
  g.temp = g.temp.filter((t) => t.left > 0);
  if (!g.waveKO) g.run.flawless++;
  g.projs = []; g.pools = []; g.mines = [];
  g.zoomT = 0; g.fortressT = g.anthemT = g.hexT = g.phaseT = 0; g.focus = 0;
  for (const c of g.cats) c.frenzyT = 0;
  addCoins(g, COIN.wave + COIN.waveGrow * g.wave);
  const chests = Math.min(2, g.chests);
  g.chests -= chests;
  g.reward = (g.bossWave ? ['cat', 'item'] : []).concat(Array(chests).fill('item'), ['snack']);
  g.report = {
    wave: g.wave, time: g.t - g.wT0, dmg: g.run.dmg - g.wDmg0, taken: g.wTaken, kills: g.wKills, coins: g.wCoins, boss: g.bossWave, chests,
    cats: g.cats.concat(g.bench).map((c) => ({ uid: c.uid, id: c.id, lvl: c.lvl, dmg: c.wDmg, kills: c.wKills, heal: c.wHeal })).sort((a, b) => b.dmg - a.dmg),
  };
  refreshHp(g, before);
  emit(g, { k: 'clear', boss: g.bossWave });
}

// ---------------------------------------------------------------- damage
function hurtEnemy(g, e, dmg, o = {}) {
  if (e.dead || e.under) return 0;
  let d = dmg * (1 + g.mods.curse);
  if (e.armor && !o.pierceArmor) d *= 1 - e.armor;
  if (e.boss) {
    // nest tricks: the Rat Castle is guarded by shield bearers, the Moon Burrow hides in a bubble, the Trash Tower rots back unless pressured
    if (e.kind === 'castle' && g.enemies.some((o) => !o.dead && o.shield > 0)) d *= 0.35;
    if (e.bubble > 0) d *= 0.08;
    e.lastHit = g.t;
  }
  const shielded = e.shield > 0;
  let absorbed = 0;
  if (shielded) {
    absorbed = Math.min(e.shield, d); e.shield -= absorbed;
    if (e.shield <= 0) emit(g, { k: 'shieldbreak', x: e.x, y: ecy(e) });
  }
  e.hp -= d - absorbed;
  e.flash = 0.1;
  const sc = g.curCat;
  if (sc) {
    sc.dmgDone += d; sc.wDmg += d; g.run.dmg += d;
    if (d > g.run.biggest) g.run.biggest = d;
    const bc = g.run.byCat[sc.id] || (g.run.byCat[sc.id] = { dmg: 0, kills: 0, heal: 0 });
    bc.dmg += d;
    const f = itemFx(sc);
    if (f.ls) healCat(g, sc, d * f.ls, sc, true);
    if (!o.tick && !shielded) {
      if (f.burn && !e.burn) e.burn = { dps: d * 0.35, t: 2, owner: sc.uid };
      if (f.slow) { e.slow = Math.max(e.slow, f.slow); e.slowT = Math.max(e.slowT, 1.5); }
      if (f.stun && !e.boss && g.rnd() < f.stun) e.stun = Math.max(e.stun, 0.6);
    }
  }
  if (!e.boss && !o.silent) e.kb = Math.min(9, e.kb + (e.w > 50 ? 1.6 : 4));
  if (!o.silent) emit(g, { k: 'dmg', x: e.x, y: ecy(e) - e.h * 0.4, v: d, crit: !!o.crit });
  if (o.slow && !shielded) { e.slow = Math.max(e.slow, o.slow); e.slowT = Math.max(e.slowT, o.slowT || 2); }
  if (o.stun && !e.boss && !shielded) e.stun = Math.max(e.stun, o.stun);
  if (o.burn && !shielded) e.burn = { dps: o.burn.dps * BASE_DMG * (o.mult || 1), t: o.burn.t, owner: sc ? sc.uid : 0 };
  if (o.poison && !shielded) {
    const p = e.poison;
    e.poison = { dps: (p ? p.dps : 0) + o.poison.dps * BASE_DMG * (o.mult || 1), t: o.poison.t, owner: sc ? sc.uid : 0 };
  }
  g.zoom = Math.min(100, g.zoom + (e.boss ? 0.15 : 0.12));
  if (e.hp <= 0) killEnemy(g, e, true);
  return d;
}

function killEnemy(g, e, credit) {
  if (e.dead) return;
  e.dead = true;
  if (credit) {
    const sc = g.curCat;
    if (sc) { sc.sp = Math.min(1, sc.sp + (e.boss ? 0.2 : e.elite ? 0.06 : 0.025)); sc.kills++; sc.wKills++; (g.run.byCat[sc.id] || (g.run.byCat[sc.id] = { dmg: 0, kills: 0, heal: 0 })).kills++; }
    if (e.boss) { g.run.bossKills++; g.wKills++; addCoins(g, COIN.nest + COIN.nestGrow * e.n, e.x, e.y); emit(g, { k: 'bossDown', x: e.x, y: e.y }); }
    else {
      g.run.kills++; g.wKills++; g.zoom = Math.min(100, g.zoom + 2.4);
      emit(g, { k: 'kill', x: e.x, y: ecy(e), type: e.type, elite: e.elite });
      addCoins(g, e.elite ? COIN.elite : COIN.kill, e.x, ecy(e));
      if (g.rnd() < (e.elite ? 0.22 : 0.012) * (1 + g.meta.luck * 0.4 + g.route.chest + ((g.daily && g.daily.mod.chest) || 0))) { g.chests++; emit(g, { k: 'chest', x: e.x, y: ecy(e) }); }
    }
  }
  if (e.boss) {
    for (const o of g.enemies) if (!o.dead && o !== e) { o.dead = true; emit(g, { k: 'kill', x: o.x, y: ecy(o), type: o.type, quiet: true }); }
  }
}

function addCoins(g, n, x, y) {
  const v = n * (g.mods ? g.mods.coin : 1) * g.diff.coin * g.route.coin * ((g.daily && g.daily.mod.coin) || 1);
  g.run.coins += v; g.wCoins += v;
  if (x !== undefined) emit(g, { k: 'coin', x, y, v });
}

function koCat(g, c) {
  c.ko = true; c.hp = 0;
  g.waveKO = true;
  emit(g, { k: 'ko', uid: c.uid, id: c.id });
  const angel = g.cats.find((x) => !x.ko && x !== c && !x.revUsed && CAT_BY_ID[x.id].pas && CAT_BY_ID[x.id].pas.revive);
  if (angel) {
    angel.revUsed = true;
    c.ko = false; c.hp = Math.round(catMaxHp(g, c) * 0.35);
    emit(g, { k: 'revive', uid: c.uid });
  }
}

function hurtCat(g, c, dmg) {
  if (!c || c.ko) return;
  const d = CAT_BY_ID[c.id];
  if (d.pas && d.pas.dodge && g.rnd() < d.pas.dodge) { emit(g, { k: 'dodge', uid: c.uid }); return; }
  if (g.phaseT > 0 && g.rnd() < 0.6) { emit(g, { k: 'dodge', uid: c.uid }); return; }
  const v = dmg * (1 - Math.min(0.8, g.mods.dr + itemFx(c).dr)) * (g.fortressT > 0 ? 0.3 : 1) * g.hurtMul;
  c.hp -= v;
  c.taken += v; g.run.taken += v; g.wTaken += v;
  c.flash = 0.18;
  emit(g, { k: 'cathit', uid: c.uid, v });
  if (c.hp <= 0) koCat(g, c);
}

function healCat(g, c, v, src, quiet) {
  if (!c || c.ko) return;
  const mx = catMaxHp(g, c);
  const h = Math.min(mx - c.hp, v);
  if (h > 0.05) {
    c.hp += h;
    if (src) { src.healDone += h; src.wHeal += h; g.run.healed += h; }
    if (!quiet && h > 0.5) emit(g, { k: 'heal', uid: c.uid, v: h });
  }
}

function weakestCat(g) {
  let best = null, br = 2;
  for (const c of g.cats) if (!c.ko) { const r = c.hp / catMaxHp(g, c); if (r < br) { br = r; best = c; } }
  return br < 0.97 ? best : null;
}

// ---------------------------------------------------------------- cat side
const catPos = (g, rank) => ({ x: g.towerX + 30, y: GROUND - 36 - rank * SLOT });

function targetsInRange(g, range, from) {
  const out = [];
  for (const e of g.enemies) {
    if (e.dead || e.under || e.x < g.towerX - 10) continue;
    const edge = e.x - e.w * (e.boss ? 0.45 : 0.4) - from;
    if (edge <= range) out.push(e);
  }
  out.sort((a, b) => a.x - b.x);
  if (g.focus) { const i = out.findIndex((e) => e.uid === g.focus); if (i > 0) out.unshift(out.splice(i, 1)[0]); }
  return out;
}

function critRoll(g, c, a) {
  const m = g.mods;
  const f = cfx(m, c);
  const crit = g.rnd() < m.crit + (a.crit || 0) + f.crit;
  return crit ? m.critMul + f.critMul : 1;
}

function fireProj(g, c, rank, a, target, mult) {
  const m = g.mods, p = catPos(g, rank);
  const cm = critRoll(g, c, a);
  const dmg = catDmg(c, m, mult) * cm;
  let tx = target.x, ty = ecy(target);
  const dx = tx - p.x, dy = ty - p.y;
  const spread = a.count > 1 ? (c.shots++ % a.count - (a.count - 1) / 2) * 0.09 : 0;
  const ang = Math.atan2(dy, dx) + spread;
  const sp = a.speed;
  g.projs.push({
    x: p.x + 12, y: p.y - 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg, r: a.r || 4, kind: 'cat', color: a.color,
    pierce: a.pierce || 0, hits: new Set(), splash: a.splash || 0, homing: !!a.homing, life: (a.range + 60) / sp * 1.4,
    fx: a, crit: cm > 1, pierceArmor: !!a.pierceArmor, owner: c.uid, from: p.x, mult: LVL_MUL[c.lvl - 1] * (1 + m.dmg),
  });
  emit(g, { k: 'shoot', id: c.id, x: p.x, y: p.y });
}

function fireLob(g, c, rank, a, target, mult) {
  const m = g.mods, p = catPos(g, rank);
  const cm = critRoll(g, c, a);
  const T = Math.max(0.35, Math.hypot(target.x - p.x, 60) / 380);
  g.projs.push({
    kind: 'lob', x: p.x, y: p.y, x0: p.x + 10, y0: p.y, x1: target.x - 6 - (target.spd || 0) * T * 0.4, y1: target.fly ? ecy(target) : GROUND + 8, t: 0, T,
    dmg: catDmg(c, m, mult) * cm, crit: cm > 1, splash: a.splash, color: a.color, fx: a, owner: c.uid, pierceArmor: !!a.pierceArmor, mult: LVL_MUL[c.lvl - 1] * (1 + m.dmg),
  });
  emit(g, { k: 'shoot', id: c.id, x: p.x, y: p.y });
}

function explode(g, x, y, r, dmg, o = {}) {
  emit(g, { k: 'boom', x, y, r, color: o.color });
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (Math.abs(e.x - x) <= r + e.w * 0.35) hurtEnemy(g, e, dmg, o);
  }
}

function attack(g, c, rank, d) {
  const a = d.atk, m = g.mods;
  const p = catPos(g, rank);
  const fx = cfx(m, c), ex = fx.extra;
  const range = (a.range || 400) * (1 + m.range + fx.range) + rank * 22;
  const t = a.t;
  if (t === 'mine') {
    const first = targetsInRange(g, 520, p.x)[0];
    if (g.mines.length >= a.max + 2 * ex || !first) return false;
    for (let i = 0; i <= ex; i++) g.mines.push({ x: Math.max(p.x + 70, first.x - 30 - g.rnd() * 90 - i * 40), dmg: catDmg(c, m), splash: a.splash, arm: 0.5, owner: c.uid });
    emit(g, { k: 'shoot', id: c.id, x: p.x, y: p.y });
    return true;
  }
  if (t === 'nova') {
    const near = targetsInRange(g, a.radius * (1 + m.range + fx.range) - 20, p.x - 40);
    if (!near.length) return false;
    const cm = critRoll(g, c, a);
    emit(g, { k: 'nova', x: p.x, y: GROUND - 20, r: a.radius });
    for (const e of g.enemies) if (!e.dead && e.x - p.x < a.radius + e.w * 0.3) {
      hurtEnemy(g, e, catDmg(c, m) * cm * (1 + 0.25 * ex), { stun: a.freeze, slow: 0.5, slowT: 3, crit: cm > 1 });
    }
    return true;
  }
  if (t === 'strike' || t === 'storm') {
    const near = targetsInRange(g, range, p.x - 40);
    if (!near.length) return false;
    const n = t === 'strike' ? 1 + ex : a.stars + 2 * ex;
    for (let i = 0; i < n; i++) {
      const e = pick(g, near);
      const cm = critRoll(g, c, a);
      emit(g, { k: t === 'strike' ? 'bolt' : 'star', x: e.x, y: ecy(e), ground: GROUND });
      explode(g, e.x, ecy(e), a.splash, catDmg(c, m) * cm, { stun: a.stun, crit: cm > 1, color: t === 'strike' ? '#fff27a' : '#ffe9a0' });
    }
    return true;
  }
  const targets = targetsInRange(g, range, p.x - 40 + (t === 'melee' ? 30 : 0));
  if (!targets.length) return false;
  let tg = targets[0];
  if (a.target === 'strong') tg = targets.reduce((b, e) => (e.hp > b.hp ? e : b), targets[0]);
  c.atk = 0.22;

  if (t === 'melee') {
    const cm = critRoll(g, c, a), dmg = catDmg(c, m) * cm;
    let hit = [tg];
    if (a.pierce) hit = targets.filter((e) => e.x - e.w * 0.4 - p.x <= range);
    else if (a.cleave || ex) hit = [tg, ...targets.filter((e) => e !== tg && Math.abs(e.x - tg.x) < 60).slice(0, (a.cleave || 0) + ex)];
    let dealt = 0;
    hit.forEach((e, i) => { dealt += hurtEnemy(g, e, dmg * (i ? 0.6 : 1), { crit: cm > 1 }); });
    emit(g, { k: 'swipe', x: tg.x - tg.w * 0.4, y: ecy(tg), id: c.id, wide: !!a.pierce });
    if (a.lifesteal) { healCat(g, c, dealt * a.lifesteal * 0.5, c); healCat(g, weakestCat(g), dealt * a.lifesteal * 0.5, c); }
    return true;
  }
  if (t === 'cone') {
    const dmg = catDmg(c, m) * (1 + 0.25 * ex);
    for (const e of targets) hurtEnemy(g, e, dmg, { burn: a.burn, mult: LVL_MUL[c.lvl - 1] * (1 + m.dmg), silent: g.rnd() < 0.6, pierceArmor: true });
    emit(g, { k: 'flame', x: p.x + 14, y: p.y - 4, len: Math.min(range, tg.x - p.x + 40), id: c.id });
    return true;
  }
  if (t === 'chain') {
    const cm = critRoll(g, c, a);
    let e = tg, dmg = catDmg(c, m) * cm;
    const seen = new Set(), pts = [{ x: p.x + 14, y: p.y - 8 }];
    for (let j = 0; j <= a.jumps + ex && e; j++) {
      seen.add(e);
      pts.push({ x: e.x, y: ecy(e) });
      hurtEnemy(g, e, dmg, { stun: a.stun, crit: cm > 1 });
      dmg *= a.fall;
      let nx = null, nd = 150;
      for (const o of g.enemies) if (!o.dead && !seen.has(o)) { const dd = Math.hypot(o.x - e.x, ecy(o) - ecy(e)); if (dd < nd) { nd = dd; nx = o; } }
      e = nx;
    }
    emit(g, { k: 'chain', pts, id: c.id });
    return true;
  }
  if (t === 'beam') {
    const cm = critRoll(g, c, a), dmg = catDmg(c, m) * cm * (1 + 0.25 * ex);
    const hit = targets.filter((e) => e.x - e.w * 0.4 - p.x <= range);
    for (const e of hit) hurtEnemy(g, e, dmg, { pierceArmor: true, crit: cm > 1 });
    emit(g, { k: 'beam', x: p.x + 14, y: p.y - 4, x2: p.x + range, y2: ecy(tg), id: c.id });
    return true;
  }
  if (t === 'spread') {
    const near = targets.slice(0, 3);
    const cm = critRoll(g, c, a), dmg = catDmg(c, m) * cm;
    for (let i = 0; i < a.pellets + 2 * ex; i++) {
      const e = near[i % near.length] && g.rnd() < 0.7 ? near[i % near.length] : near[0];
      hurtEnemy(g, e, dmg, { silent: i > 1, crit: cm > 1 });
      emit(g, { k: 'pellet', x: p.x + 16, y: p.y - 4, x2: e.x, y2: ecy(e) + (g.rnd() - 0.5) * 16 });
    }
    emit(g, { k: 'shoot', id: c.id, x: p.x, y: p.y, big: true });
    return true;
  }
  if (t === 'lob') { fireLob(g, c, rank, a, tg, 1); for (let i = 0; i < ex; i++) fireLob(g, c, rank, a, targets[i + 1] || tg, 1); return true; }
  if (t === 'proj') {
    const n = (a.count || 1) + ex;
    if (a.burst) { c.burst = a.burst - 1; c.burstT = a.gap; c.tgt = tg.uid; }
    for (let i = 0; i < n; i++) fireProj(g, c, rank, a, tg, 1);
    return true;
  }
  return false;
}

function support(g, c, rank, s) {
  if (s.t === 'heal') {
    const w = weakestCat(g);
    if (!w) return false;
    const a = AURA_MUL[c.lvl - 1];
    healCat(g, w, catMaxHp(g, w) * s.pct * a, c);
    const p = catPos(g, rank);
    emit(g, { k: 'healfx', x: p.x, y: p.y });
    return true;
  }
  return false;
}

function updateCats(g, dt) {
  const m = g.mods;
  const alive = aliveCats(g);
  alive.forEach((c, rank) => {
    const d = CAT_BY_ID[c.id];
    c.flash = Math.max(0, c.flash - dt);
    c.atk = Math.max(0, c.atk - dt);
    const f = cfx(m, c);
    let hs = 1 + m.haste + f.haste;
    if (c.frenzyT > 0) { c.frenzyT -= dt; hs *= 2.2; }
    if (g.anthemT > 0) hs *= 1.5;
    c.sp = Math.min(1, c.sp + dt / SPECIAL_TIME);
    const mxh = catMaxHp(g, c, m);
    c.low = c.hp < mxh * 0.5;
    if (f.regen) healCat(g, c, mxh * f.regen * dt, c, true);
    g.curCat = c;
    if (c.burst > 0) {
      c.burstT -= dt;
      if (c.burstT <= 0) {
        const a = d.atk;
        const tg = g.enemies.find((e) => e.uid === c.tgt && !e.dead) || targetsInRange(g, a.range * (1 + m.range + f.range) + rank * 22, g.towerX)[0];
        if (tg) fireProj(g, c, rank, a, tg, 1);
        c.burst--; c.burstT = a.gap;
        if (!tg) c.burst = 0;
      }
    }
    c.cd -= dt * hs;
    if (c.cd <= 0) { if (attack(g, c, rank, d)) c.cd += d.atk.cd; else c.cd = 0.08; }
    if (d.sup) {
      c.scd -= dt * hs;
      if (c.scd <= 0) { if (support(g, c, rank, d.sup)) c.scd += d.sup.cd; else c.scd = 0.4; }
    }
    g.curCat = null;
  });
}

// ---------------------------------------------------------------- projectiles, mines, pools
function updateProjs(g, dt) {
  const m = g.mods;
  for (const p of g.projs) {
    if (p.dead) continue;
    g.curCat = p.owner ? findCat(g, p.owner) || null : null;
    if (p.kind === 'lob') {
      p.t += dt;
      const u = Math.min(1, p.t / p.T);
      p.x = p.x0 + (p.x1 - p.x0) * u;
      p.y = p.y0 + (p.y1 - p.y0) * u - Math.sin(u * Math.PI) * 130;
      if (u >= 1) {
        p.dead = true;
        const f = p.fx;
        explode(g, p.x1, p.y1, p.splash, p.dmg, { crit: p.crit, burn: f.burn, mult: p.mult, color: p.color, pierceArmor: p.pierceArmor });
        if (f.pool) g.pools.push({ x: p.x1, r: f.pool.r, dps: f.pool.dps * BASE_DMG * p.mult, t: f.pool.t, max: f.pool.t, owner: p.owner });
      }
      continue;
    }
    if (p.kind === 'enemy') {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x <= p.tx) {
        p.dead = true;
        const al = aliveCats(g);
        if (al.length) hurtCat(g, pick(g, al), p.dmg);
      }
      continue;
    }
    if (p.homing) {
      let best = null, bd = 1e9;
      for (const e of g.enemies) if (!e.dead) { const d = Math.hypot(e.x - p.x, ecy(e) - p.y); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const sp = Math.hypot(p.vx, p.vy);
        const want = Math.atan2(ecy(best) - p.y, best.x - p.x), cur = Math.atan2(p.vy, p.vx);
        let da = want - cur;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        const na = cur + Math.max(-6 * dt, Math.min(6 * dt, da));
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0 || p.x > W + 60 || p.y > GROUND + 40 || p.y < -60) { p.dead = true; continue; }
    for (const e of g.enemies) {
      if (e.dead || p.hits.has(e)) continue;
      if (Math.hypot(e.x - p.x, ecy(e) - p.y) < e.w * 0.42 + p.r) {
        p.hits.add(e);
        const f = p.fx;
        hurtEnemy(g, e, p.dmg, { crit: p.crit, pierceArmor: p.pierceArmor, slow: f.fx && f.fx.slow, slowT: f.fx && f.fx.t, poison: f.poison, mult: p.mult });
        if (p.splash) { explode(g, p.x, p.y, p.splash, p.dmg * 0.6, { color: p.color }); p.dead = true; break; }
        if (p.hits.size > p.pierce) { p.dead = true; break; }
      }
    }
  }
  g.curCat = null;
  g.projs = g.projs.filter((p) => !p.dead);
}

function updateMinesPools(g, dt) {
  for (const mi of g.mines) {
    mi.arm -= dt;
    if (mi.arm > 0) continue;
    if (g.enemies.some((e) => !e.dead && !e.fly && Math.abs(e.x - mi.x) < 30 + e.w * 0.3)) {
      mi.dead = true;
      g.curCat = findCat(g, mi.owner) || null;
      explode(g, mi.x, GROUND - 6, mi.splash, mi.dmg, { color: '#ffb02e' });
      g.curCat = null;
    }
  }
  g.mines = g.mines.filter((x) => !x.dead);
  g.tickT += dt;
  const tick = g.tickT >= 0.25;
  if (tick) g.tickT -= 0.25;
  for (const p of g.pools) {
    p.t -= dt;
    if (tick) {
      g.curCat = findCat(g, p.owner) || null;
      for (const e of g.enemies) if (!e.dead && !e.fly && Math.abs(e.x - p.x) < p.r + e.w * 0.3) hurtEnemy(g, e, p.dps * 0.25, { silent: true, pierceArmor: true, tick: true });
      g.curCat = null;
    }
  }
  g.pools = g.pools.filter((p) => p.t > 0);
  // damage over time (burn and poison)
  if (tick) {
    for (const e of g.enemies) {
      if (e.dead) continue;
      for (const k of ['burn', 'poison']) {
        const s = e[k];
        if (!s) continue;
        s.t -= 0.25;
        g.curCat = s.owner ? findCat(g, s.owner) || null : null;
        hurtEnemy(g, e, s.dps * 0.25, { silent: true, pierceArmor: true, tick: true });
        g.curCat = null;
        if (s.t <= 0) e[k] = null;
      }
    }
  }
}

// ---------------------------------------------------------------- enemy side
function spawnFromNest(g, nest) {
  const w = g.wave;
  const live = g.enemies.filter((e) => !e.dead).length;
  if (live >= MAX_ENEMIES) return;
  const types = Object.keys(ENEMY_TYPES).filter((k) => ENEMY_TYPES[k].minWave <= w && ENEMY_TYPES[k].cost <= 4 + w * 0.2);
  const type = pick(g, types);
  const e = makeEnemy(g, type, w, { x: nest.x - 50, elite: w >= 10 && g.rnd() < 0.1 });
  g.enemies.push(e);
  emit(g, { k: 'spawn', x: e.x, y: e.y });
}

function updateEnemies(g, dt) {
  const front = g.towerX + 30;
  const sorted = g.enemies.filter((e) => !e.dead && !e.fly && e.ai !== 'nest').sort((a, b) => a.x - b.x);
  let lim = front;
  const alive = aliveCats(g);
  const m = g.mods;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.swing = Math.max(0, e.swing - dt);
    e.t += dt; e.age += dt; e.kb *= Math.exp(-11 * dt);
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
    if (e.ai === 'nest') { nestAI(g, e, dt); continue; }
    if (e.stun > 0) { e.stun -= dt; continue; }
    const sp = e.spd * (1 - Math.min(0.85, e.slow + m.slow));
    if (!alive.length) continue;
    if (e.ai === 'melee') {
      // handled in the queue pass below
    } else if (e.ai === 'range' || e.ai === 'shaman') {
      const stop = front + e.range;
      if (e.x > stop) e.x = Math.max(stop, e.x - sp * dt);
      else if (e.ai === 'range') {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = ENEMY_TYPES.slinger.cd * (e.elite ? 0.8 : 1);
          e.swing = 0.3;
          const tx = front, ty = GROUND - 50 - g.rnd() * 60;
          const dx = tx - e.x, dy = ty - (e.y - e.h * 0.6), L = Math.hypot(dx, dy);
          g.projs.push({ kind: 'enemy', x: e.x - 10, y: e.y - e.h * 0.6, vx: dx / L * 300, vy: dy / L * 300, tx, dmg: e.dmg });
          emit(g, { k: 'eshoot', x: e.x, y: e.y - e.h * 0.6 });
        }
      } else {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = 2.6;
          e.swing = 0.4;
          for (const o of g.enemies) if (!o.dead && o !== e && !o.boss && Math.abs(o.x - e.x) < 230) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.14); emit(g, { k: 'ehealfx', x: o.x, y: ecy(o) }); }
        }
      }
    } else if (e.ai === 'fly') {
      const stop = front + 60;
      if (e.x > stop) e.x -= sp * dt;
      else {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = ENEMY_TYPES.glider.cd; e.swing = 0.3;
          const top = alive[alive.length - 1];
          hurtCat(g, top, e.dmg);
        }
      }
    } else if (e.ai === 'dash') {
      // runs past the queue, then leaps onto the stack and bites the top cat like a glider
      if (!e.leaped) {
        e.x -= sp * dt;
        if (e.x <= front + 130) { e.leaped = true; e.fly = true; e.alt = 96; e.cd = 0.3; emit(g, { k: 'leap', x: e.x, y: e.y }); }
      } else if (e.x > front + 40) e.x -= sp * dt * 0.6;
      else {
        e.cd -= dt;
        if (e.cd <= 0) { e.cd = ENEMY_TYPES.dasher.cd; e.swing = 0.3; hurtCat(g, alive[alive.length - 1], e.dmg); }
      }
    } else if (e.ai === 'burrow') {
      // tunnels under the field (cannot be hit) and pops up near the stack, then fights like a melee mouse
      e.x -= sp * dt;
      if (e.under && e.x <= front + 230) { e.under = false; e.ai = 'melee'; emit(g, { k: 'dig', x: e.x, y: e.y }); }
    } else if (e.ai === 'bomb') {
      if (e.x > front + 24) e.x -= sp * dt;
      else {
        e.dead = true;
        emit(g, { k: 'boom', x: e.x, y: GROUND - 20, r: 70, color: '#ff8a3d', enemy: true });
        for (const c of alive) hurtCat(g, c, e.dmg * 0.7);
        g.run.kills++;
      }
    }
  }
  // melee queue: closest first, each stops behind the one in front
  if (alive.length) {
    for (const e of sorted) {
      if (e.dead || e.ai !== 'melee' || e.stun > 0) continue;
      const sp = e.spd * (1 - Math.min(0.85, e.slow + m.slow));
      const minX = lim + e.w * 0.5 + 2;
      if (e.x > minX) e.x = Math.max(minX, e.x - sp * dt);
      if (e.x <= minX + 4) {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.cd = ENEMY_TYPES[e.type].cd * (e.elite ? 0.85 : 1);
          e.swing = 0.25;
          if (e.x - e.w * 0.5 - front < 46) {
            const tank = alive.find((c) => CAT_BY_ID[c.id].pas && CAT_BY_ID[c.id].pas.taunt);
            const victim = tank || alive[0];
            hurtCat(g, victim, e.dmg);
            const th = itemFx(victim).thorns;
            if (th && !e.dead) { g.curCat = victim; hurtEnemy(g, e, e.dmg * th, { tick: true }); g.curCat = null; }
            emit(g, { k: 'ehit', x: front + 6, y: GROUND - 30 });
          }
        }
      }
      lim = Math.max(lim, e.x - e.w * 0.18);
    }
  }
  g.enemies = g.enemies.filter((e) => !e.dead);
}

function nestAI(g, e, dt) {
  const hpr = e.hp / e.maxHp;
  const rage = hpr < 0.4 ? 1.7 : hpr < 0.7 ? 1.3 : 1;
  e.spawnT -= dt * rage;
  if (e.spawnT <= 0) {
    e.spawnT = Math.max(1.1, 3.0 - e.n * 0.12);
    e.swing = 0.35;
    spawnFromNest(g, e);
  }
  // swarm bursts at hp thresholds
  const ph = hpr < 0.3 ? 3 : hpr < 0.55 ? 2 : hpr < 0.8 ? 1 : 0;
  if (ph > e.phase) {
    e.phase = ph;
    const n = 4 + Math.min(6, e.n);
    for (let i = 0; i < n; i++) spawnFromNest(g, e);
    emit(g, { k: 'roar', x: e.x, y: e.y - 80 });
  }
  // each nest has its own trick (see NESTS in cats.js)
  if (e.bubble > 0) e.bubble -= dt;
  if (e.kind === 'pipe') {
    e.dashT = (e.dashT == null ? 6 : e.dashT) - dt * rage;
    if (e.dashT <= 0) {
      e.dashT = Math.max(5.5, 10 - e.n * 0.35);
      const n = 2 + Math.min(4, Math.floor(e.n / 2));
      for (let i = 0; i < n; i++) { const d = makeEnemy(g, 'dasher', g.wave, { x: e.x - 50 - i * 18 }); g.enemies.push(d); emit(g, { k: 'spawn', x: d.x, y: d.y }); }
      e.swing = 0.35;
    }
  } else if (e.kind === 'castle') {
    e.guardT = (e.guardT == null ? 4 : e.guardT) - dt * rage;
    if (e.guardT <= 0 && g.enemies.filter((o) => !o.dead && o.shield > 0).length < 2 + (e.n > 4 ? 1 : 0)) {
      e.guardT = Math.max(7, 11 - e.n * 0.3);
      const d = makeEnemy(g, 'shield', g.wave, { x: e.x - 50 }); g.enemies.push(d); emit(g, { k: 'spawn', x: d.x, y: d.y });
    }
  } else if (e.kind === 'trash') {
    if (g.t - (e.lastHit || 0) > 2.2 && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.035 * dt); if (g.rnd() < dt * 4) emit(g, { k: 'ehealfx', x: e.x, y: e.y - 70 }); }
  } else if (e.kind === 'moon') {
    e.moonT = (e.moonT == null ? 8 : e.moonT) - dt;
    if (e.moonT <= 0 && !(e.bubble > 0)) { e.moonT = Math.max(7, 11 - e.n * 0.3); e.bubble = 2.4; emit(g, { k: 'bubble', x: e.x, y: e.y - 70 }); }
  }
  // cheese bombs lobbed at the stack
  e.bombT -= dt * rage;
  if (e.bombT <= 0) {
    e.bombT = Math.max(2.8, 6.5 - e.n * 0.2);
    const al = aliveCats(g);
    if (al.length) {
      const sc = waveScale(g.wave);
      g.projs.push({ kind: 'enemy', x: e.x - 40, y: e.y - 110, vx: -(e.x - g.towerX - 30) / 1.1, vy: (GROUND - 70 - (e.y - 110)) / 1.1, tx: g.towerX + 34, dmg: 14 * sc.dmg, big: true });
      emit(g, { k: 'eshoot', x: e.x, y: e.y - 110 });
    }
  }
}

// ---------------------------------------------------------------- main step
export function useZoomies(g) {
  if (g.state !== 'fight' || g.zoom < 100) return false;
  g.zoom = 0; g.zoomT = g.zoomMax;
  emit(g, { k: 'zoom' });
  return true;
}

export function step(g, dt = DT) {
  if (g.state === 'intro') {
    g.intro -= dt;
    g.scroll += 60 * dt;
    if (g.intro <= 0) g.state = 'fight';
    return;
  }
  if (g.state !== 'fight') return;
  g.t += dt;
  g.mods = calcMods(g);
  for (const t in g.mods.syn.counts) if (g.mods.syn.counts[t] > g.run.synMax) g.run.synMax = g.mods.syn.counts[t];
  if (g.zoomT > 0) g.zoomT -= dt;
  for (const k of ['fortressT', 'anthemT', 'hexT', 'phaseT']) if (g[k] > 0) g[k] = Math.max(0, g[k] - dt);
  if (g.focus && !g.enemies.some((e) => e.uid === g.focus && !e.dead && !e.under)) g.focus = 0;

  // spawn from the queue
  g.qT += dt;
  while (g.queue.length && g.queue[0].t <= g.qT) {
    if (g.enemies.filter((e) => !e.dead).length >= MAX_ENEMIES) { g.qT -= dt; break; }
    const q = g.queue.shift();
    g.enemies.push(makeEnemy(g, q.type, g.wave, { elite: q.elite }));
  }

  // The stack strolls right: while nothing is in claw reach the whole world scrolls toward it.
  const front = g.towerX + 30;
  let near = Infinity, any = false, reach = 1e9;
  for (const c of aliveCats(g)) {
    const a = CAT_BY_ID[c.id].atk;
    reach = Math.min(reach, a.t === 'nova' ? a.radius - 30 : a.t === 'mine' ? 300 : a.range) * 1;
  }
  for (const e of g.enemies) if (!e.dead && !e.fly) { any = true; near = Math.min(near, e.x - e.w * 0.4 - (front - 10)); }
  g.marching = near > Math.max(40, reach * (1 + g.mods.range) * 0.8) && aliveCats(g).length > 0;
  if (g.marching) {
    const v = any ? (near > 260 ? 125 : 58) : 30;
    g.scroll += v * dt;
    if (any) {
      const sh = v * dt;
      for (const e of g.enemies) if (!e.dead) e.x -= sh;
      for (const mi of g.mines) mi.x -= sh;
      for (const p of g.pools) p.x -= sh;
    }
  }

  updateCats(g, dt);
  updateProjs(g, dt);
  updateMinesPools(g, dt);
  updateEnemies(g, dt);

  if (!aliveCats(g).length && g.cats.length) {
    if (g.nineLives > 0) {
      g.nineLives--; g.run.nine++;
      for (const c of g.cats) { c.ko = false; c.hp = Math.round(catMaxHp(g, c) * 0.5); }
      for (const e of g.enemies) if (!e.dead && !e.boss) e.stun = 2.5;
      emit(g, { k: 'nine' });
    } else {
      g.state = 'over';
      emit(g, { k: 'over' });
      return;
    }
  }
  if (!g.queue.length && g.enemies.every((e) => e.dead)) finishWave(g);
}

export function runSeconds(g, sec, dt = DT) {
  for (let i = 0; i < sec / dt && g.state !== 'over' && g.state !== 'clear'; i++) step(g, dt);
}

// ---------------------------------------------------------------- routes and starting gifts
export function rollRoutes(g, n = 3) {
  const pool = ROUTES.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(g.rnd() * pool.length), 1)[0].id);
  return out;
}
export function chooseRoute(g, id) {
  g.route = ROUTE_BY_ID[id] || ROUTE_BY_ID.trail;
  if (g.route.healNow) {
    for (const c of g.cats.concat(g.bench)) c.hp = Math.min(catMaxHp(g, c), c.hp + catMaxHp(g, c) * g.route.healNow);
    emit(g, { k: 'routeheal' });
  }
}
export function grantStartItem(g) {
  if (!g.meta.startItem || !g.cats.length) return null;
  const rares = ITEMS.filter((i) => i.rarity === 'rare');
  const it = rares[Math.floor(g.rnd() * rares.length)];
  g.stash.push(it.id);
  equipItem(g, g.stash.length - 1, g.cats[0].uid);
  return it.id;
}

// ================================================================ special moves, event stops
export const specialInfo = (id) => SPECIALS[id] || { kind: 'frenzy', name: 'Power Up', icon: '✨', color: '#ffd23f', pow: 1 };
export const specialReady = (c) => !c.ko && c.sp >= 1;
const foesOf = (g) => g.enemies.filter((e) => !e.dead && !e.under && e.x >= g.towerX - 10 && e.x < W + 30);
const pickN = (g, arr, n) => { const a = arr.slice(), out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(g.rnd() * a.length), 1)[0]); return out; };

// Fire a cat's special. Returns false when it is not allowed (not fighting, cat down, not charged).
export function useSpecial(g, uid) {
  const c = findCat(g, uid);
  if (!c || g.state !== 'fight' || !g.cats.includes(c) || !specialReady(c)) return false;
  const info = specialInfo(c.id), foes = foesOf(g), pow = info.pow, m = g.mods || calcMods(g);
  const dmg = (mult) => catDmg(c, m, mult * pow);
  const front = g.towerX + 30, rank = Math.max(0, g.cats.indexOf(c)), from = catPos(g, rank);
  g.run.specials = (g.run.specials || 0) + 1;
  g.curCat = c;
  emit(g, { k: 'special', uid: c.uid, id: c.id, kind: info.kind, name: info.name, color: info.color, x: from.x, y: from.y });
  switch (info.kind) {
    case 'frenzy': c.frenzyT = 5 * pow; break;
    case 'fortress': g.fortressT = 5; break;
    case 'anthem': g.anthemT = 6; break;
    case 'phase': g.phaseT = 5; break;
    case 'hex': g.hexT = 6; for (const e of foes) emit(g, { k: 'ehealfx', x: e.x, y: ecy(e) }); break;
    case 'heal': {
      for (const cc of g.cats) {
        if (cc.ko) { cc.ko = false; cc.hp = Math.round(catMaxHp(g, cc) * 0.35); emit(g, { k: 'revive', uid: cc.uid }); }
        healCat(g, cc, catMaxHp(g, cc) * 0.4 * pow, c);
      }
      emit(g, { k: 'healfx', x: front, y: GROUND - 90 });
      break;
    }
    case 'inferno': {
      for (let i = 0; i < 4; i++) emit(g, { k: 'flame', x: front + 20, y: GROUND - 30 - i * 24, len: 320 });
      for (const e of foes) if (e.x < front + 330) hurtEnemy(g, e, dmg(3), { burn: { dps: 0.5, t: 3 }, mult: 1 });
      break;
    }
    case 'storm': {
      const t = foes.slice().sort((a, b) => a.x - b.x).slice(0, 10);
      const pts = [{ x: front, y: GROUND - 120 }].concat(t.map((e) => ({ x: e.x, y: ecy(e) })));
      if (pts.length > 1) emit(g, { k: 'chain', pts });
      for (const e of t) { emit(g, { k: 'star', x: e.x, y: ecy(e) }); hurtEnemy(g, e, dmg(2.6), { stun: 0.9 }); }
      break;
    }
    case 'volley': {
      for (let i = 0; i < 9 && foes.length; i++) {
        const e = foes[Math.floor(g.rnd() * foes.length)];
        emit(g, { k: 'pellet', x: from.x + 14, y: from.y, x2: e.x, y2: ecy(e) });
        hurtEnemy(g, e, dmg(1.4), { crit: g.rnd() < 0.2 });
      }
      break;
    }
    case 'freeze': {
      emit(g, { k: 'nova', x: front, y: GROUND - 40, r: 330 });
      for (const e of foes) hurtEnemy(g, e, dmg(0.8), { stun: e.boss ? 0 : 2.6 * pow, slow: 0.6, slowT: 3.5 });
      break;
    }
    case 'snipe': {
      const t = foes.slice().sort((a, b) => b.hp - a.hp)[0];
      if (t) { emit(g, { k: 'beam', x: from.x + 14, y: from.y, x2: t.x, y2: ecy(t) }); emit(g, { k: 'star', x: t.x, y: ecy(t) }); hurtEnemy(g, t, dmg(t.boss ? 5 : 13), { pierceArmor: true, crit: true }); }
      break;
    }
    case 'barrage': {
      for (let i = 0; i < 7; i++) {
        const e = foes.length ? foes[Math.floor(g.rnd() * foes.length)] : null;
        const x = e ? e.x + (g.rnd() - 0.5) * 40 : front + 140 + i * 70;
        explode(g, x, GROUND - 8, 78, dmg(1.7), { color: info.color });
      }
      break;
    }
    case 'meteor': {
      let best = null, bn = -1;
      for (const e of foes) { const n = foes.filter((o) => Math.abs(o.x - e.x) < 130).length + (e.boss ? 2 : 0); if (n > bn) { bn = n; best = e; } }
      const x = best ? best.x : front + 260;
      emit(g, { k: 'star', x, y: GROUND - 40 });
      explode(g, x, GROUND - 30, 150, dmg(7), { color: info.color });
      break;
    }
    case 'toxin': for (const e of foes) hurtEnemy(g, e, dmg(0.6), { poison: { dps: 1.2, t: 5 }, mult: 1 }); break;
    case 'supernova': {
      emit(g, { k: 'nova', x: front + 200, y: GROUND - 60, r: 520 });
      for (const e of foes) hurtEnemy(g, e, dmg(e.boss ? 3 : 4.2));
      break;
    }
    default: break;
  }
  c.sp = 0;                       // after the effect, so kills it causes do not refill it at once
  g.curCat = null;
  return true;
}

// tapping a mouse makes every cat that can reach it shoot it first
export function setFocus(g, uid) {
  const e = g.enemies.find((o) => o.uid === uid && !o.dead && !o.under);
  g.focus = e ? e.uid : 0;
  return !!e;
}

// ---- event stops: a break between waves with a choice (see EVENTS in cats.js)
const itemPrice = (g, id) => Math.round({ common: 45, rare: 110, epic: 250 }[ITEM_BY_ID[id].rarity] * (1 + 0.03 * g.wave));
export function eventDue(g) { return g.wave >= 3 && !g.bossWave && g.wave % 3 === 0; }
export function rollEvent(g) {
  if (!eventDue(g)) return null;
  const hurt = g.cats.some((c) => c.hp < catMaxHp(g, c) * 0.7);
  const pool = EVENTS.filter((e) => !(e.id === 'rest' && !hurt && g.rnd() < 0.7));
  const def = pool[Math.floor(g.rnd() * pool.length)];
  const ev = { id: def.id, name: def.name, icon: def.icon, desc: def.desc, options: [], done: false };
  const items = rollItemChoices(g, 3);
  switch (def.id) {
    case 'shop':
      for (const id of items) ev.options.push({ k: 'buy', item: id, cost: itemPrice(g, id) });
      ev.options.push({ k: 'heal', cost: Math.round(55 + g.wave * 2), pct: 0.4 });
      ev.options.push({ k: 'reroll', cost: Math.round(70 + g.wave * 2) });
      ev.multi = true;
      break;
    case 'shrine': {
      const epic = ITEMS.filter((i) => i.rarity === 'epic'), rare = ITEMS.filter((i) => i.rarity === 'rare');
      ev.options.push({ k: 'blood', item: rare[Math.floor(g.rnd() * rare.length)].id, hp: 0.25 });
      ev.options.push({ k: 'gamble', cost: Math.round(80 + g.wave * 3), item: epic[Math.floor(g.rnd() * epic.length)].id, chance: 0.6 });
      ev.options.push({ k: 'leave' });
      break;
    }
    case 'rest':
      ev.options.push({ k: 'heal', cost: 0, pct: 0.6 });
      ev.options.push({ k: 'reroll', cost: 0, bonusCoins: 30 + g.wave * 2 });
      break;
    case 'deal': {
      const epic = ITEMS.filter((i) => i.rarity === 'epic'), rare = ITEMS.filter((i) => i.rarity === 'rare');
      ev.options.push({ k: 'curse', item: epic[Math.floor(g.rnd() * epic.length)].id, hurt: 0.12 });
      ev.options.push({ k: 'curse', item: rare[Math.floor(g.rnd() * rare.length)].id, hurt: 0.05 });
      ev.options.push({ k: 'leave' });
      break;
    }
    case 'picnic':
      for (const id of rollSnackChoices(g, 3)) ev.options.push({ k: 'snack', id });
      ev.options.push({ k: 'leave' });
      break;
    case 'fountain':
      ev.options.push({ k: 'toss', cost: 40, chance: 0.4, prize: 100 });
      ev.options.push({ k: 'toss', cost: 100, chance: 0.35, prize: 280 });
      ev.options.push({ k: 'leave' });
      ev.multi = true;
      break;
    case 'dojo':
      for (const c of g.cats) ev.options.push({ k: 'train', uid: c.uid, bonus: 0.1 });
      ev.options.push({ k: 'leave' });
      break;
    default: break;
  }
  g.event = ev; g.eventsSeen++; g.run.events = (g.run.events || 0) + 1;
  return ev;
}
// returns { ok, msg, again } ; again=true means the stop stays open (the shop sells several things)
export function chooseEvent(g, idx) {
  const ev = g.event, o = ev && ev.options[idx];
  if (!o || o.sold) return { ok: false, msg: 'Nothing there' };
  if (o.cost > g.run.coins) return { ok: false, msg: 'Not enough coins' };
  const spend = (n) => { g.run.coins -= n; };
  let msg = '';
  switch (o.k) {
    case 'buy': spend(o.cost); takeItem(g, o.item); o.sold = true; msg = `Bought ${ITEM_BY_ID[o.item].name}`; break;
    case 'heal': {
      spend(o.cost);
      const before = snapshotMax(g);
      for (const c of g.cats.concat(g.bench)) { if (c.ko) c.ko = false; c.hp = Math.min(catMaxHp(g, c), Math.max(c.hp, 1) + catMaxHp(g, c) * o.pct); }
      refreshHp(g, before); msg = 'The team feels better'; if (!ev.multi) ev.done = true; else o.sold = true; break;
    }
    case 'reroll': spend(o.cost); g.rerolls++; if (o.bonusCoins) g.run.coins += o.bonusCoins; msg = '+1 reroll'; if (!ev.multi) ev.done = true; else o.sold = true; break;
    case 'blood':
      for (const c of g.cats) if (!c.ko) c.hp = Math.max(1, c.hp - catMaxHp(g, c) * o.hp);
      takeItem(g, o.item); msg = `The shrine gives ${ITEM_BY_ID[o.item].name}`; ev.done = true; break;
    case 'gamble':
      spend(o.cost);
      if (g.rnd() < o.chance) { takeItem(g, o.item); msg = `Lucky! ${ITEM_BY_ID[o.item].name}`; } else msg = 'The shrine stays quiet';
      ev.done = true; break;
    case 'curse': takeItem(g, o.item); g.hurtMul *= 1 + o.hurt; msg = `${ITEM_BY_ID[o.item].name}, but mice bite ${Math.round(o.hurt * 100)}% harder now`; ev.done = true; break;
    case 'snack': eatSnack(g, o.id); msg = `${SNACK_BY_ID[o.id].name} eaten`; ev.done = true; break;
    case 'toss':
      spend(o.cost); o.sold = true;
      if (g.rnd() < o.chance) { g.run.coins += o.prize; g.run.fountainWins = (g.run.fountainWins || 0) + 1; msg = `The fountain pays back ${o.prize} coins!`; } else msg = 'Plop. Nothing happens';
      break;
    case 'train': { const c = findCat(g, o.uid); if (c) { c.train = (c.train || 0) + o.bonus; msg = `${CAT_BY_ID[c.id].name} trained: +${Math.round(o.bonus * 100)}% damage`; } ev.done = true; break; }
    default: msg = 'You move on'; ev.done = true; break;
  }
  return { ok: true, msg, again: !ev.done };
}
export function endEvent(g) { g.event = null; }
