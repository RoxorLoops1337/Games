// Content unlock engine: Unlock Points (UP), the queue, run gating, save migration. Model constants live in data/unlocks.js.
// Pure functions over the meta object (meta.unlocked.*). Must NOT import meta.js, run.js (they import us).
// Meta fields (all under meta.unlocked, additive): ids {unlockId:1}, points, lifetime, played {hero:n}, killed {enemyId:1}, maxAct, v (model version).
// Run gating: run.unlockedAtStart = undefined (everything open: tools and old runs) | array of unlocked ids (non start items) ; start items always open.
import { UNLOCKS, UNLOCK_OF_ITEM, STEPS, TOTAL_COST, LOCKED_IDS, UP, HERO_GATES, AFFINITY_WINDOW, AFFINITY_MIN_RUNS, WELCOME_UP_PER_RUN, WELCOME_UP_CAP, uid, inventory } from '../data/unlocks.js';
import { HEROES, CARDS, GRAFTS, RELICS, POTIONS, EVENTS } from '../data/index.js';
export { UP, TOTAL_COST, HERO_GATES, STEPS, UNLOCKS, inventory };

const NAMES = { card: CARDS, graft: GRAFTS, relic: RELICS, potion: POTIONS, event: EVENTS };
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const SEEN_KEY = { card: 'cards', graft: 'grafts', relic: 'relics', potion: 'potions', event: 'events' };

export function unlockDefaults() { return { ids: {}, points: 0, lifetime: 0, played: {}, killed: {}, maxAct: 1, v: 1 }; }
function U(m) { // the unlock block, repaired in place
  if (!isObj(m.unlocked)) m.unlocked = { heroes: ['marrow'], relics: [] };
  const u = m.unlocked, d = unlockDefaults();
  for (const k of Object.keys(d)) if (u[k] === undefined || typeof u[k] !== typeof d[k] || (isObj(d[k]) && !isObj(u[k]))) u[k] = d[k];
  return u;
}
// NEW ribbon set: unlock ids opened by a finished run and not yet seen in an offer. Additive, repaired in place.
export function freshOf(m) { const u = U(m); if (!isObj(u.fresh)) u.fresh = {}; return u.fresh; }
export function isFresh(m, itemId) { const id = unlockIdOf(itemId); return !!(id && m && m.unlocked && isObj(m.unlocked.fresh) && m.unlocked.fresh[id]); }
export function takeFresh(m, itemId) { const id = unlockIdOf(itemId); if (!id || !isFresh(m, itemId)) return false; delete m.unlocked.fresh[id]; return true; }
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

// ---------------- queries ----------------
// A start item is open for everyone. Unknown ids are not gated (true); hero ids follow the hero list.
export function isUnlocked(m, unlockId) {
  if (typeof unlockId === 'string' && unlockId.startsWith('hero:')) return !!(m && m.unlocked && m.unlocked.heroes.includes(unlockId.slice(5)));
  const e = UNLOCKS[unlockId]; if (!e) return false;
  if (e.tier === 'start') return true;
  return !!(m && m.unlocked && m.unlocked.ids && m.unlocked.ids[unlockId]);
}
export function isItemUnlocked(m, kind, itemId) { const e = UNLOCKS[uid(kind, itemId)]; return !e || isUnlocked(m, e.id); } // ungated items count as open
export function unlockIdOf(itemId) { const e = UNLOCK_OF_ITEM[itemId]; return e ? e.id : null; }
export function lockedHint(itemId) { const e = UNLOCK_OF_ITEM[itemId] || UNLOCKS[itemId]; return e ? e.hint : ''; }
export function unlockedIds(m) { return Object.keys((m && m.unlocked && m.unlocked.ids) || {}).filter((k) => UNLOCKS[k] && UNLOCKS[k].tier === 'locked'); }
function nameOf(e) { const d = NAMES[e.kind][e.itemId]; return d ? d.name : e.itemId; }
function entryView(e, m) { return { unlockId: e.id, kind: e.kind, itemId: e.itemId, name: nameOf(e), rarity: e.rarity, hero: e.hero, hint: e.hint, cost: e.cost, step: e.step, unlocked: m ? isUnlocked(m, e.id) : false }; }

function openItems(m, s) { return s.items.filter((e) => !isUnlocked(m, e.id)); }
export function stepCost(m, s) { const open = openItems(m, s).length; return open === 0 ? 0 : open === s.items.length ? s.cost : Math.max(1, Math.ceil(s.cost * open / s.items.length)); }
// Open steps in the order they will unlock for this player: designed order, steps of heroes not yet unlocked wait,
// and the most played hero's cards jump ahead inside a short window.
function orderedOpen(m) {
  const u = U(m);
  const open = STEPS.filter((s) => openItems(m, s).length && (!s.hero || m.unlocked.heroes.includes(s.hero)));
  let fav = null, best = AFFINITY_MIN_RUNS - 1;
  for (const h of Object.keys(u.played)) if (m.unlocked.heroes.includes(h) && u.played[h] > best) { best = u.played[h]; fav = h; }
  const out = [];
  while (open.length) {
    let i = 0;
    if (fav) { const w = open.slice(0, AFFINITY_WINDOW).findIndex((s) => s.hero === fav); if (w > 0) i = w; }
    out.push(open.splice(i, 1)[0]);
  }
  return out;
}
export function nextStep(m) { return orderedOpen(m)[0] || null; }
function stepView(m, s) { return { stepId: s.id, kind: s.kind, hero: s.hero, cost: stepCost(m, s), items: openItems(m, s).map((e) => entryView(e, m)) }; }

export function unlockState(m) {
  const u = U(m), ord = orderedOpen(m);
  const total = LOCKED_IDS.length, got = LOCKED_IDS.filter((k) => u.ids[k]).length;
  const inv = inventory();
  const heroes = Object.values(HEROES).filter((h) => h.unlock).map((h) => ({ id: h.id, name: h.name, unlocked: m.unlocked.heroes.includes(h.id), hint: heroHint(m, h.id) }));
  return {
    points: Math.floor(u.points), lifetime: Math.floor(u.lifetime), nextCost: ord.length ? stepCost(m, ord[0]) : 0,
    queue: ord.slice(0, 5).map((s) => stepView(m, s)), unlockedCount: got, total, startCount: Object.values(UNLOCKS).length - total, percent: total ? Math.round((100 * got) / total) : 100,
    done: got >= total, heroes, upCap: UP.RUN_CAP, inventory: inv, totalCost: TOTAL_COST,
  };
}

// ---------------- heroes ----------------
export function finishedRuns(m) { return nz(m.stats && m.stats.wins) + nz(m.stats && m.stats.deaths); }
export function heroHint(m, id) { const g = HERO_GATES[id]; if (!g) return ''; return `${g.text} Runs finished: ${finishedRuns(m)}.`; }
export function heroGate(m, id) { // true when the hero should open now
  const g = HERO_GATES[id]; if (!g) return false;
  const u = U(m), n = finishedRuns(m);
  const trig = g.rule === 'act2' ? u.maxAct >= 2 : nz(Object.values(m.wins || {}).reduce((a, b) => a + nz(b), 0)) > 0;
  return (n >= g.runs && trig) || n >= g.fallbackRuns;
}

// ---------------- UP ----------------
export function runDigest(run) {
  const st = run.stats || {};
  return { floors: st.floors || 0, elites: st.elites || 0, bosses: st.bosses || 0, act: Math.max(1, Math.min(3, run.act || 1)), won: run.phase === 'won' || run.outcome === 'won', asc: run.ascension || 0, assist: !!run.assist, abandoned: !!run.abandoned };
}
// Pure: UP for a digest plus the number of first-time kills and new achievements. Returns { up, parts, capped }.
export function computeUP(d, newKills = 0, newAch = 0) {
  if (d.abandoned && d.floors < UP.ABANDON_MIN_FLOORS) return { up: 0, parts: {}, capped: false };
  const parts = {
    base: UP.FLOOR, floors: d.floors * UP.PER_FLOOR, elites: Math.min(UP.ELITE_MAX, d.elites) * UP.ELITE, bosses: d.bosses * UP.BOSS,
    act: UP.ACT[d.act] || 0, win: d.won ? UP.WIN + UP.PER_ASC * d.asc : 0,
    firstKills: Math.min(UP.FIRST_KILL_MAX, newKills) * UP.FIRST_KILL, achievements: Math.min(UP.ACHIEVEMENT_MAX, newAch) * UP.ACHIEVEMENT,
  };
  let raw = Object.values(parts).reduce((a, b) => a + b, 0);
  const capped = Math.min(UP.RUN_CAP, raw) * (d.assist ? UP.ASSIST_MULT : 1); // Assist pays at most half the cap
  const up = Math.max(UP.FLOOR, Math.round(capped));
  return { up, parts, capped: raw > UP.RUN_CAP, raw };
}

// Bookkeeping that must happen before the hero gates are read (idempotent per run).
export function trackRun(m, run) {
  if (!m || !run || run.unlockTracked) return;
  run.unlockTracked = true;
  const u = U(m);
  u.maxAct = Math.max(u.maxAct, run.phase === 'won' ? 3 : Math.min(3, run.act || 1));
  if (run.hero) u.played[run.hero] = (u.played[run.hero] || 0) + 1;
}
function newKillsOf(m, run) {
  const u = U(m); let n = 0;
  for (const id of run.killedEnemies || []) if (!u.killed[id]) { u.killed[id] = 1; n++; }
  return n;
}
function spend(m) {
  const u = U(m), now = [];
  for (let guard = 0; guard < 400; guard++) {
    const s = nextStep(m); if (!s) break;
    const c = stepCost(m, s);
    if (u.points + 1e-9 < c) break;
    u.points -= c;
    for (const e of openItems(m, s)) { u.ids[e.id] = 1; now.push(entryView({ ...e }, m)); }
  }
  return now;
}
// Called from recordRunEnd once per finished run. result = the recordRunEnd result (newAchievements read from it).
export function awardRun(m, run, result) {
  if (!m || !run) return { up: 0, unlockedNow: [] };
  const u = U(m);
  trackRun(m, run);
  const d = runDigest(run);
  const kills = newKillsOf(m, run);
  const ach = result && result.newAchievements ? result.newAchievements.length : 0;
  const r = computeUP(d, kills, ach);
  u.points += r.up; u.lifetime += r.up;
  const unlockedNow = spend(m);
  for (const e of unlockedNow) freshOf(m)[e.unlockId] = 1; // the NEW ribbon (ui/archive_kit.js) shows once per item, the first time it is offered
  const st = unlockState(m);
  return { up: r.up, parts: r.parts, capped: r.capped, newKills: kills, newAchievements: ach, points: st.points, nextCost: st.nextCost, unlockedNow, unlockedCount: st.unlockedCount, total: st.total, percent: st.percent, done: st.done };
}

// ---------------- run gating ----------------
const cache = new WeakMap();
function setOf(run) { let s = cache.get(run); const a = run.unlockedAtStart; if (!s || s.src !== a) { s = { src: a, set: new Set(a) }; cache.set(run, s); } return s.set; }
// Is this item allowed to be rolled in this run? Ungated items and runs without a snapshot are always open.
export function runAllows(run, itemId) {
  const a = run && run.unlockedAtStart;
  if (!Array.isArray(a)) return true;
  const e = UNLOCK_OF_ITEM[itemId];
  if (!e || e.tier === 'start') return true;
  return setOf(run).has(e.id);
}
// Resolve newRun's `unlocked` option: 'all' | undefined => everything, 'start' => starting pool only, array/Set => ids, meta object => its set.
export function snapshotFor(opt) {
  if (opt === undefined || opt === null || opt === 'all') return undefined;
  if (opt === 'start') return [];
  if (Array.isArray(opt)) return opt.filter((k) => UNLOCKS[k] && UNLOCKS[k].tier === 'locked');
  if (opt instanceof Set) return [...opt].filter((k) => UNLOCKS[k] && UNLOCKS[k].tier === 'locked');
  if (isObj(opt) && opt.unlocked) return unlockedIds(opt);
  return undefined;
}
// Helper for flow.start: add the player's set to the newRun options (Daily always uses the starting pool).
export function withUnlocks(m, opts = {}) { return { ...opts, unlocked: opts.daily ? 'start' : m }; }

// ---------------- migration ----------------
// Old saves (no unlocked.v): keep everything seen in the codex, plus a one-time UP grant for the runs already played.
export function migrateUnlock(m, hadModel) {
  const u = U(m);
  if (!hadModel) {
    for (const e of Object.values(UNLOCKS)) {
      if (e.tier !== 'locked') continue;
      if (m.seen && m.seen[SEEN_KEY[e.kind]] && m.seen[SEEN_KEY[e.kind]][e.itemId]) u.ids[e.id] = 1;
    }
    for (const h of m.history || []) if (h && h.hero) u.played[h.hero] = (u.played[h.hero] || 0) + 1;
    for (const id of Object.keys((m.seen && m.seen.enemies) || {})) u.killed[id] = 1;
    const n = finishedRuns(m);
    if (n > 0) { const g = Math.min(WELCOME_UP_CAP, n * WELCOME_UP_PER_RUN); u.points += g; u.lifetime += g; }
    if (n > 0 && (m.bestAsc && Object.keys(m.bestAsc).length || Object.values(m.wins || {}).some((x) => x > 0))) u.maxAct = 3;
    else if (m.unlocked.heroes.includes('wick')) u.maxAct = 2;
    spend(m);
  }
  u.v = 1; u.points = nz(u.points); u.lifetime = Math.max(nz(u.lifetime), u.points);
  for (const k of Object.keys(u.ids)) if (!UNLOCKS[k] || UNLOCKS[k].tier !== 'locked') delete u.ids[k];
  return m;
}
