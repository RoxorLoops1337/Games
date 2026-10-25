// Meta progression + settings, persisted under graftwork_meta_v1 (key is final, never rename).
// Pure functions over a plain meta object. Storage is injectable (setStorage) so tests run in node.
import { lsGet, lsSet } from './save.js';
import { HEROES } from '../data/index.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { strainInfo, budgetOf, MAX_GRAFTS_NORMAL } from './cards.js';
import { CARDS } from '../data/index.js';
import { ASCENSION_TEXT } from './run.js';

export const KEY = 'graftwork_meta_v1';
export const HISTORY_MAX = 20;
export const MAX_ASC = 10;
export const SEEN_KINDS = ['cards', 'grafts', 'enemies', 'relics', 'potions', 'statuses', 'events'];
export const DEFAULT_SETTINGS = { master: 0.8, sfx: 0.8, music: 0.35, screenShake: true, reducedMotion: false, colorblind: false, largeText: false, tips: true, muted: false };
export { ACHIEVEMENTS };

// ---------- storage (injectable) ----------
let storage = null; // { getItem(k), setItem(k, v) } or null for the engine/save.js default
export function setStorage(s) { storage = s || null; }
const rd = () => { try { return storage ? storage.getItem(KEY) : lsGet(KEY); } catch { return null; } };
const wr = (v) => { try { if (storage) storage.setItem(KEY, v); else lsSet(KEY, v); } catch { /* storage full or blocked: play on */ } };

// ---------- shape ----------
export function defaultMeta() {
  const heroes = Object.values(HEROES).filter((h) => h.unlocked).map((h) => h.id);
  if (!heroes.includes('marrow')) heroes.unshift('marrow');
  const seen = {}; for (const k of SEEN_KINDS) seen[k] = {};
  return {
    v: 1,
    unlocked: { heroes, relics: [] },
    bestAsc: {}, wins: {}, winAsc: {},
    stats: { runs: 0, wins: 0, deaths: 0, floors: 0, grafts: 0, shatters: 0, elites: 0, bosses: 0, goldEarned: 0, bestLoop: 0, fastestWinFloors: null, dailyWins: 0 },
    seen, achievements: {},
    daily: { lastPlayed: null, best: null },
    tips: {}, settings: { ...DEFAULT_SETTINGS }, history: [],
  };
}
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
// Fill missing or wrong-typed fields from the defaults, keep everything else (additive migration).
function fill(t, d) {
  for (const k of Object.keys(d)) {
    const dv = d[k];
    if (t[k] === undefined || (isObj(dv) ? !isObj(t[k]) : Array.isArray(dv) ? !Array.isArray(t[k]) : dv !== null && typeof dv !== typeof t[k])) t[k] = isObj(dv) ? fill({}, dv) : Array.isArray(dv) ? dv.slice() : dv;
    else if (isObj(dv)) fill(t[k], dv);
  }
  return t;
}
export function migrate(m) {
  if (!isObj(m)) return defaultMeta();
  fill(m, defaultMeta());
  for (const k of Object.keys(m.stats)) if (k !== 'fastestWinFloors' && !Number.isFinite(m.stats[k])) m.stats[k] = 0;
  if (m.stats.fastestWinFloors !== null && !Number.isFinite(m.stats.fastestWinFloors)) m.stats.fastestWinFloors = null;
  for (const k of SEEN_KINDS) if (!isObj(m.seen[k])) m.seen[k] = {};
  if (!m.unlocked.heroes.includes('marrow')) m.unlocked.heroes.unshift('marrow');
  m.unlocked.heroes = m.unlocked.heroes.filter((h) => typeof h === 'string');
  m.history = m.history.filter(isObj).slice(0, HISTORY_MAX);
  m.v = 1;
  return m;
}
export function loadMeta() {
  let raw = null;
  try { raw = JSON.parse(rd() || 'null'); } catch { raw = null; }
  return migrate(raw);
}
export function saveMeta(m) { wr(JSON.stringify(m)); }

// ---------- settings / tips ----------
export function setting(m, key) { const s = m && m.settings; return s && s[key] !== undefined ? s[key] : DEFAULT_SETTINGS[key]; }
export function setSetting(m, key, value, save = true) { m.settings[key] = value; if (save) saveMeta(m); }
export function tipSeen(m, id) { return !!m.tips[id]; }
export function markTip(m, id) { if (!m.tips[id]) { m.tips[id] = 1; saveMeta(m); } }

// ---------- codex ----------
export function markSeen(m, kind, id) {
  if (!m || !id || !SEEN_KINDS.includes(kind)) return false;
  if (!isObj(m.seen)) m.seen = {};
  if (!isObj(m.seen[kind])) m.seen[kind] = {};
  if (m.seen[kind][id]) return false;
  m.seen[kind][id] = 1; return true;
}
export function isSeen(m, kind, id) { return !!(m && m.seen && m.seen[kind] && m.seen[kind][id]); }
export function codexCount(m) { let n = 0; for (const k of SEEN_KINDS) n += Object.keys((m.seen && m.seen[k]) || {}).length; return n; }
export function seenFromRun(m, run) {
  if (!m || !run) return;
  for (const i of run.deck || []) { markSeen(m, 'cards', i.id); for (const g of i.grafts || []) markSeen(m, 'grafts', g); }
  for (const r of run.relics || []) markSeen(m, 'relics', r);
  for (const p of run.potions || []) markSeen(m, 'potions', p);
  for (const e of run.seenEvents || []) markSeen(m, 'events', e);
}

// ---------- queries ----------
export function heroUnlocked(m, id) { return m.unlocked.heroes.includes(id); }
export function maxAscension(m, hero) { return Math.min(MAX_ASC, (m.bestAsc && m.bestAsc[hero]) || 0); }
export function isAchieved(m, id) { return !!(m.achievements && m.achievements[id]); }
export function achievementProgress(m, id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return { n: 0, max: 1, done: false };
  const done = isAchieved(m, id);
  let n = done ? 1 : 0, max = 1;
  if (a.progress) { try { [n, max] = a.progress(m); } catch { /* keep defaults */ } }
  if (done) n = max;
  return { n, max, done };
}
export function dailyPlayed(m, seed) { return m.daily.lastPlayed === seed; }

// ---------- run hooks ----------
export function onRunStart(m, run) {
  m.stats.runs++;
  if (run && run.daily) m.daily.lastPlayed = typeof run.daily === 'string' ? run.daily : run.seed;
  saveMeta(m);
}

function endContext(run, outcome, m) {
  const won = outcome === 'won';
  let strain = { strain: 0, tithed: [] }, budget = 0;
  try { strain = strainInfo(run); budget = budgetOf(run); } catch { /* synthetic run */ }
  const deck = run.deck || [];
  let graftTotal = 0, maxOnCard = 0, overloaded = 0, junk = 0;
  for (const i of deck) {
    const n = (i.grafts || []).length; graftTotal += n; maxOnCard = Math.max(maxOnCard, n);
    if (n > MAX_GRAFTS_NORMAL) overloaded++;
    if (CARDS[i.id] && CARDS[i.id].type === 'junk') junk++;
  }
  return {
    outcome, won, loop: run.loop || 0, hero: run.hero, asc: run.ascension || 0, daily: run.daily || null, abandoned: !!run.abandoned,
    floors: (run.stats && run.stats.floors) || 0, strain: strain.strain, tithed: strain.tithed.length, budget, graftTotal, maxOnCard, overloaded, junk,
    deckSize: deck.length, gold: run.gold || 0, relics: (run.relics || []).length, codex: codexCount(m),
  };
}

export function recordRunEnd(m, run, outcome) {
  const res = { newUnlocks: [], newAchievements: [] };
  if (!m || !run) return res;
  if (run.metaDone) return res; // never count one run twice
  run.metaDone = true;
  const won = outcome === 'won';
  const st = run.stats || {};
  const S = m.stats;
  if (won) S.wins++; else S.deaths++;
  S.floors += st.floors || 0; S.grafts += st.grafts || 0; S.shatters += st.shatters || 0;
  S.elites += st.elites || 0; S.bosses += st.bosses || 0; S.goldEarned += st.goldEarned || 0;
  S.bestLoop = Math.max(S.bestLoop, run.loop || 0);
  const asc = run.ascension || 0;
  if (won) {
    S.fastestWinFloors = S.fastestWinFloors === null ? (st.floors || 0) : Math.min(S.fastestWinFloors, st.floors || 0);
    m.wins[run.hero] = (m.wins[run.hero] || 0) + 1;
    m.winAsc[run.hero] = Math.max(m.winAsc[run.hero] || 0, asc);
    if (run.daily) S.dailyWins++;
    const next = Math.min(MAX_ASC, asc + 1);
    if (next > maxAscension(m, run.hero) && next > asc) {
      m.bestAsc[run.hero] = next;
      res.newUnlocks.push({ kind: 'ascension', id: run.hero + ':' + next, name: 'Ascension ' + next, text: ASCENSION_TEXT[next] || '' });
    }
  }
  if (run.daily) {
    const cur = m.daily.best;
    const score = (won ? 1000 : 0) + (st.floors || 0);
    if (!cur || score > (cur.score || 0)) m.daily.best = { seed: run.daily, hero: run.hero, outcome, floors: st.floors || 0, grafts: st.grafts || 0, score };
  }
  seenFromRun(m, run);

  // heroes
  const reachedAct2 = (run.act || 1) >= 2 || (run.loop || 0) > 0 || won;
  for (const h of Object.values(HEROES)) {
    if (heroUnlocked(m, h.id) || !h.unlock) continue;
    const rule = h.unlock.rule;
    if ((rule === 'act2' && reachedAct2) || (rule === 'win' && won)) {
      m.unlocked.heroes.push(h.id);
      res.newUnlocks.push({ kind: 'hero', id: h.id, name: h.name, text: h.title || h.blurb || '' });
    }
  }

  // achievements
  const ctx = endContext(run, outcome, m);
  for (const a of ACHIEVEMENTS) {
    if (isAchieved(m, a.id)) continue;
    let ok = false;
    try { ok = !!a.check(run, ctx, m); } catch { ok = false; }
    if (ok) { m.achievements[a.id] = { t: Date.now() }; res.newAchievements.push({ id: a.id, name: a.name, text: a.text }); }
  }

  m.history.unshift({ hero: run.hero, asc, outcome, floors: st.floors || 0, grafts: st.grafts || 0, date: Date.now(), seed: String(run.seed), loop: run.loop || 0, daily: !!run.daily });
  m.history = m.history.slice(0, HISTORY_MAX);
  saveMeta(m);
  return res;
}
