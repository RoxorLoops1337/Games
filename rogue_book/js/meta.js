// Inkwoven -- META: everything that lives ACROSS runs (DESIGN 4.10, 5.5). Profile, settings, run save, stats, achievements,
// Inkstones, the Library, bestiary, story and history. No DOM, no clock (callers pass `now` and `date`); the only browser
// API used is window.localStorage, always inside try/catch. This header is the contract of record for GAME and the screens.
//
// STORAGE (keys never change): profile in 'rb_profile_v1', current run in 'rb_run_v1'. A corrupt profile is kept under
// 'rb_profile_v1_bad' and the game starts fresh; an unreadable run save goes to 'rb_run_v1_bad'. When storage is missing or
// refuses writes (private mode) everything keeps working from memory for the session and save() / saveRun() return false, so
// GAME can show its one persistent "cannot be saved" toast. The memory copy is what the session reads back until a write succeeds
// again, so Continue after a failed write never rolls back. Nothing touches storage until META.load() (or a first call).
//
// SEVERAL TABS (one localStorage, many pages). The profile is never blindly overwritten: every write first pulls what another tab
// stored since this page last looked and merges it three ways against the snapshot this page last synced (`base`): counters keep
// the other tab's total plus this page's own change, bests (LISTS.statMax) keep the larger, lists and flag maps keep both sides'
// additions and honour removals, settings take this page's value only for a key it changed itself, history merges by run id. An
// Erase (reset) writes straight through, and a stale tab can no longer bring the old profile back. GAME calls refresh() on the window
// 'storage' event. Runs that were paid out are listed by id in profile.paid (newest first, max 100): saveRun never writes such a run
// back, loadRun, hasRun and runInfo drop it, and recordRun pays a run id only once, however many tabs hold a copy of the run.
//
// PROFILE {v:1, inkstones, stats{every LISTS.statKeys}, ach{id:timestamp}, unlocked{card[],relic[],gem[],hero[]}, seen{enemyId:n},
//   kills{enemyId:n}, story{loreId:true}, history[max 20, newest first], settings{DATA.SETTINGS keys}, tutorial{flag:true}, daily{last:YYYYMMDD},
//   paid[runId, max 100, newest first]}
//   Loading merges the stored object over fresh defaults, so fields added later appear with defaults and unknown fields
//   from a newer build survive a round trip. Values are sanitised (numbers finite and non-negative, settings via DATA.cleanSetting).
//
// PUBLIC API
//   State      profile (live getter)  load() -> profile  save() -> bool  reset({keepSettings}) -> profile     bus (U.bus): 'achievement' {id}, 'unlock' {kind,id}
//              refresh() -> profile: merge in whatever another tab stored (cheap when nothing changed, the live object is updated in place)
//   Settings   get(k)  set(k, v) -> cleaned value | undefined (saves at once)      keys and domains: DATA.SETTINGS
//   Run save   saveRun(R) -> bool (a finished or already paid run is never kept: its key is removed, true is returned)  loadRun() -> R | null
//              clearRun(id?) (with an id, another run's save is left alone)  hasRun() -> bool  runPaid(id) -> bool (this run id was paid out)
//              runInfo() -> {chapter, ink, heroes[ids], trial, daily, text:'Verse 2, Echo 5, Hanae and Kuro'} | null
//   Stats      track(stat, n=1) -> new value (sum, or max for LISTS.statMax; unknown keys ignored)  stat(k) -> number  mergeStats(dst, src)
//   Feats      check(R?, now?) -> [newly unlocked achievement ids], each id only ever once. Reads profile.stats plus the live R.stats
//              (never merges them), and R.deck for maxDeck / curseCards, so GAME can call it at every chapterClear and Suzu and Raiga
//              unlock mid-run. Pays the reward Inkstones, unlocks heroes (DATA.heroes[..].unlock.ach), emits on bus, saves.
//              achievements() -> [{id,name,text,k,gte,value,progress 0..1,done,ts,reward}] for the Library tab
//   Unlocks    isUnlocked(kind, id) kind 'hero'|'card'|'relic'|'gem'|'trial'  unlockedSet() -> {card[],relic[],gem[]} (what GAME passes to RUN.newRun)
//              libraryList() -> [{kind,id,cost,unlocked,affordable,name,rarity,hero}] for every def with locked:true (prices: ECONOMY.library)
//              buy(kind, id) -> {ok, reason:'unknown'|'owned'|'funds', cost}     inkstones (getter)
//              trialMax() -> highest selectable Ink Trial: wins > 0 ? min(10, trialBest + 1) : 0
//   Run end    recordRun(R, 'win'|'lose'|'abandon', now) -> {inkstones (this run's payout), bonus (achievement rewards), total, newAchievements[],
//              newTrial (new trialMax or null), heroesUnlocked[]}. Pays out once per run (sets R.recorded).
//              A run id that is already in profile.paid or history pays nothing (R.recorded is set, the result is all zeros).
//              Inkstones = floor((4 * chaptersCleared + (win ? 15 : 0) + 3 * trial + floor(score / 60)) * (daily ? 0.5 : 1) * (abandon ? 0.5 : 1)),
//              chaptersCleared = R.stats.bossKills, score = RUN.score(R), constants in ECONOMY.inkstones. A normal run merges R.stats
//              and adds runs, wins or deaths, winsHanae..., smallDeckWins (win with at most 15 cards), maxDeck and curseCards (deck at the
//              end), trialBest (on a win) and the per-enemy kills (R.foes). A DAILY run writes only dailyRuns, the half-rate Inkstones,
//              daily.last, its history row and its per-enemy kills (the bestiary has no daily exception).
//   Codex      seen(enemyId) (GAME calls it once per enemy id when a fight node is entered; saves at once)  bestiary() -> [{id,seen,kills,chapter,tier}]  history (getter)
//              loreSeen(id)  markLore(id)  storyList() -> [{id,seen,title}] (every lore id except barks_*)
//   Misc       dailySeed(date) -> YYYYMMDD int  dailyPlayed(date) -> bool  tutorial(flag) -> bool  setTutorial(flag, v=true)
const META = (() => {
  const VERSION = 1;
  const KEY = 'rb_profile_v1', KEY_BAD = 'rb_profile_v1_bad', KEY_RUN = 'rb_run_v1', KEY_RUN_BAD = 'rb_run_v1_bad';
  const HISTORY_MAX = 20;
  const PAID_MAX = 100;                                                   // run ids kept in profile.paid
  const SMALL_DECK = 15;
  const bus = U.bus();
  const mem = {};
  let P = null;
  let base = null;                                                        // what storage held when this page last read or wrote it (the merge ancestor)
  let lastRaw = null;                                                     // the exact text behind `base`: an unchanged storage value needs no merge

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const nonNeg = (v) => (isNum(v) && v > 0 ? Math.floor(v) : 0);
  const strs = (a) => (Array.isArray(a) ? a.filter((x, i) => typeof x === 'string' && a.indexOf(x) === i) : []);
  const stackKeys = () => DATA.LISTS.statKeys;
  const isMax = (k) => DATA.LISTS.statMax.indexOf(k) >= 0;

  // ---------------------------------------------------------------- storage (window.localStorage, never at load time)
  function store() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }
  // {ok, raw}: raw is a string, or null when nothing is stored; ok is false when storage exists but cannot be read (then raw is null).
  // A copy in `mem` is a write that storage refused: it is fresher than whatever storage still holds, so it is read first.
  function rawGet(k) {
    if (has(mem, k)) return { ok: true, raw: mem[k] };
    const s = store();
    if (!s) return { ok: true, raw: null };
    try { const v = s.getItem(k); return { ok: true, raw: v === null || v === undefined ? null : v }; } catch (e) { return { ok: false, raw: null }; }
  }
  const readRaw = (k) => rawGet(k).raw;
  function writeRaw(k, v) {
    const s = store();
    if (s) { try { s.setItem(k, v); delete mem[k]; return true; } catch (e) { /* memory below */ } }
    mem[k] = v;
    return false;
  }
  function removeRaw(k) {
    delete mem[k];
    const s = store();
    if (s) { try { s.removeItem(k); } catch (e) { /* nothing to do */ } }
  }

  // ---------------------------------------------------------------- profile
  function freshSettings() {
    const s = {};
    Object.keys(DATA.SETTINGS).forEach((k) => { s[k] = DATA.SETTINGS[k].def; });
    return s;
  }
  function fresh() {
    const stats = {};
    stackKeys().forEach((k) => { stats[k] = 0; });
    return { v: VERSION, inkstones: 0, stats, ach: {}, unlocked: { card: [], relic: [], gem: [], hero: [] }, seen: {}, kills: {}, story: {}, history: [], settings: freshSettings(), tutorial: {}, daily: { last: 0 }, paid: [] };
  }
  function numMap(m) {
    const out = {};
    if (isObj(m)) Object.keys(m).forEach((k) => { if (isNum(m[k]) && m[k] >= 0) out[k] = Math.floor(m[k]); });
    return out;
  }
  function flagMap(m) {
    const out = {};
    if (isObj(m)) Object.keys(m).forEach((k) => { if (m[k]) out[k] = true; });
    return out;
  }
  function normalize(src) {
    const base = fresh();
    if (!isObj(src)) return base;
    const out = Object.assign({}, src);                                   // unknown fields from a newer build survive
    out.v = isNum(src.v) && src.v >= 1 ? Math.floor(src.v) : VERSION;
    out.inkstones = nonNeg(src.inkstones);
    out.stats = Object.assign(numMap(src.stats), {});
    stackKeys().forEach((k) => { if (!has(out.stats, k)) out.stats[k] = 0; });
    out.ach = {};
    if (isObj(src.ach)) Object.keys(src.ach).forEach((k) => { if (src.ach[k] !== null && src.ach[k] !== false && src.ach[k] !== undefined) out.ach[k] = isNum(src.ach[k]) ? src.ach[k] : 0; });
    const u = isObj(src.unlocked) ? src.unlocked : {};
    out.unlocked = { card: strs(u.card), relic: strs(u.relic), gem: strs(u.gem), hero: strs(u.hero) };
    out.seen = numMap(src.seen);
    out.kills = numMap(src.kills);
    out.story = flagMap(src.story);
    out.tutorial = flagMap(src.tutorial);
    out.history = Array.isArray(src.history) ? src.history.filter(isObj).slice(0, HISTORY_MAX) : [];
    const st = isObj(src.settings) ? src.settings : {};
    out.settings = {};
    Object.keys(DATA.SETTINGS).forEach((k) => { out.settings[k] = has(st, k) ? DATA.cleanSetting(k, st[k]) : DATA.SETTINGS[k].def; });
    out.daily = { last: isObj(src.daily) ? nonNeg(src.daily.last) : 0 };
    out.paid = strs(src.paid).slice(0, PAID_MAX);
    return out;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const union = (...lists) => lists.reduce((acc, l) => acc.concat(l.filter((k) => acc.indexOf(k) < 0)), []);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Three-way merge of a counter map: the other tab's total plus this page's own change since `b`.
  function mergeCounts(b, o, s, isBest) {
    const out = {};
    union(Object.keys(b), Object.keys(o), Object.keys(s)).forEach((k) => {
      const bv = b[k] || 0, ov = o[k] || 0, sv = s[k] || 0;
      const v = isBest && isBest(k) ? (ov > bv ? Math.max(ov, sv) : sv) : nonNeg(sv + ov - bv);
      if (v > 0 || has(s, k)) out[k] = v;
    });
    return out;
  }
  const keysOf = (x) => (Array.isArray(x) ? x : isObj(x) ? Object.keys(x) : []);
  // Three-way merge of a list or flag map (as a key list): stored, plus what this page added, minus what it removed.
  function mergeKeys(b, o, s, front) {
    const bk = keysOf(b), ok = keysOf(o), sk = keysOf(s);
    const added = ok.filter((k) => bk.indexOf(k) < 0 && sk.indexOf(k) < 0);
    const gone = bk.filter((k) => ok.indexOf(k) < 0);
    const kept = sk.filter((k) => gone.indexOf(k) < 0);
    return front ? added.concat(kept) : kept.concat(added);
  }
  const flags = (keys) => keys.reduce((m, k) => { m[k] = true; return m; }, {});
  const rowKey = (r) => (r && r.id !== undefined ? String(r.id) + '|' + r.outcome : JSON.stringify(r));
  const KNOWN = ['v', 'inkstones', 'stats', 'ach', 'unlocked', 'seen', 'kills', 'story', 'history', 'settings', 'tutorial', 'daily', 'paid'];
  // b: the snapshot this page last synced, o: this page's live profile, s: what storage holds now. All three normalised.
  function mergeProfile(b, o, s) {
    const out = clone(s);
    out.v = Math.max(o.v, s.v);
    out.inkstones = nonNeg(s.inkstones + o.inkstones - b.inkstones);
    out.stats = mergeCounts(b.stats, o.stats, s.stats, isMax);
    out.seen = mergeCounts(b.seen, o.seen, s.seen);
    out.kills = mergeCounts(b.kills, o.kills, s.kills);
    out.ach = {};
    mergeKeys(b.ach, o.ach, s.ach).forEach((k) => { out.ach[k] = has(s.ach, k) ? s.ach[k] : o.ach[k]; });
    out.unlocked = {};
    ['card', 'relic', 'gem', 'hero'].forEach((k) => { out.unlocked[k] = mergeKeys(b.unlocked[k], o.unlocked[k], s.unlocked[k]); });
    out.story = flags(mergeKeys(b.story, o.story, s.story));
    out.tutorial = flags(mergeKeys(b.tutorial, o.tutorial, s.tutorial));
    const known = {};
    b.history.forEach((r) => { known[rowKey(r)] = true; });
    const fresher = o.history.filter((r) => !known[rowKey(r)]);
    out.history = fresher.concat(s.history.filter((r) => !fresher.some((f) => rowKey(f) === rowKey(r)))).slice(0, HISTORY_MAX);
    out.settings = {};
    Object.keys(DATA.SETTINGS).forEach((k) => { out.settings[k] = same(o.settings[k], b.settings[k]) ? s.settings[k] : o.settings[k]; });
    out.daily = { last: o.daily.last > b.daily.last ? Math.max(o.daily.last, s.daily.last) : s.daily.last };
    out.paid = mergeKeys(b.paid, o.paid, s.paid, true).slice(0, PAID_MAX);
    Object.keys(o).forEach((k) => { if (KNOWN.indexOf(k) < 0 && (!has(s, k) || !same(o[k], b[k]))) out[k] = o[k]; });   // fields of a newer build ride along
    return normalize(out);
  }
  // Replace the contents of dst by src without replacing dst (and the arrays and maps inside it): screens keep references to the live profile.
  function adopt(dst, src) {
    Object.keys(dst).forEach((k) => { if (!has(src, k)) delete dst[k]; });
    Object.keys(src).forEach((k) => {
      const a = dst[k], b = src[k];
      if (Array.isArray(a) && Array.isArray(b)) { a.length = 0; b.forEach((x) => a.push(x)); }
      else if (isObj(a) && isObj(b)) adopt(a, b);
      else dst[k] = b;
    });
    return dst;
  }
  // Fold in what another tab stored since this page last looked. True when something changed.
  function pull() {
    if (!P) return false;
    const got = rawGet(KEY);
    if (!got.ok || got.raw === lastRaw) return false;
    if (got.raw === null) { lastRaw = null; return false; }               // the key vanished outside the game: this page's copy stands
    let stored = null;
    try { const parsed = JSON.parse(got.raw); stored = isObj(parsed) ? normalize(parsed) : null; } catch (e) { stored = null; }
    lastRaw = got.raw;
    if (!stored) { writeRaw(KEY_BAD, got.raw); return false; }            // junk from elsewhere is kept aside, this page's copy wins the next write
    adopt(P, mergeProfile(base, P, stored));
    base = stored;
    return true;
  }
  function ensure() { if (!P) load(); }
  function load() {
    const raw = readRaw(KEY);
    let parsed = null, corrupt = false;
    if (raw !== null) {
      try { parsed = JSON.parse(raw); } catch (e) { corrupt = true; }
      if (!corrupt && !isObj(parsed)) corrupt = true;
      if (corrupt) { writeRaw(KEY_BAD, raw); parsed = null; }
    }
    P = normalize(parsed);
    base = clone(P);
    lastRaw = raw;
    return P;
  }
  function write() {
    let json;
    try { json = JSON.stringify(P); } catch (e) { return false; }
    const ok = writeRaw(KEY, json);
    lastRaw = json;
    base = clone(P);
    return ok;
  }
  function save() {
    ensure();
    pull();
    return write();
  }
  function refresh() {
    ensure();
    pull();
    return P;
  }
  // An Erase writes straight through (no merge): a stale tab holding the old profile can only add its own later changes. The ledger of
  // paid run ids survives it, so a leftover copy of a finished run cannot be paid out again into the fresh profile.
  function reset(opts) {
    const keep = opts && opts.keepSettings && P ? P.settings : null;
    const paid = P ? P.paid : [];
    P = fresh();
    P.paid = paid.slice();
    if (keep) P.settings = keep;
    removeRaw(KEY_RUN);
    write();
    return P;
  }

  // ---------------------------------------------------------------- settings
  function get(k) {
    ensure();
    return DATA.SETTINGS[k] ? P.settings[k] : undefined;
  }
  function set(k, v) {
    ensure();
    if (!DATA.SETTINGS[k]) return undefined;
    P.settings[k] = DATA.cleanSetting(k, v);
    save();
    return P.settings[k];
  }

  // ---------------------------------------------------------------- the run save
  // A run that was paid out (this tab or another) must never come back: its id is in profile.paid, or still in the history.
  function runPaid(id) {
    ensure();
    if (typeof id !== 'string' || !id) return false;
    return P.paid.indexOf(id) >= 0 || P.history.some((h) => h && h.id === id);
  }
  function parseRun() {
    const raw = readRaw(KEY_RUN);
    if (raw === null) return { raw: null, o: null };
    try { return { raw, o: JSON.parse(raw) }; } catch (e) { return { raw, o: null }; }
  }
  // Remove the saved run, unless it is a different run than `id` (another tab may have started a new tale since).
  function dropRun(id) {
    const { raw, o } = parseRun();
    if (raw === null) return;
    if (typeof id === 'string' && isObj(o) && typeof o.id === 'string' && o.id !== id) return;
    removeRaw(KEY_RUN);
  }
  function saveRun(R) {
    ensure();
    if (!R) return false;
    pull();
    if (R.done || runPaid(R.id)) { dropRun(R.id); return true; }
    let json;
    try { json = JSON.stringify(RUN.serialize(R)); } catch (e) { return false; }
    return writeRaw(KEY_RUN, json);
  }
  function loadRun() {
    ensure();
    pull();
    const { raw, o } = parseRun();
    if (raw === null) return null;
    let R = null;
    try { R = o ? RUN.deserialize(o) : null; } catch (e) { R = null; }
    if (!R || R.done || runPaid(R.id)) {
      if (!R) writeRaw(KEY_RUN_BAD, raw);
      removeRaw(KEY_RUN);
      return null;
    }
    return R;
  }
  function clearRun(id) { if (typeof id === 'string') dropRun(id); else removeRaw(KEY_RUN); }
  function hasRun() {
    ensure();
    pull();
    const { o } = parseRun();
    return isObj(o) && o.v === RUN.VERSION && Array.isArray(o.heroes) && o.heroes.length === 2 && !o.done && !runPaid(o.id);
  }
  function runInfo() {
    ensure();
    pull();
    const { o } = parseRun();
    if (!isObj(o) || o.v !== RUN.VERSION || !Array.isArray(o.heroes) || o.heroes.length !== 2 || runPaid(o.id)) return null;
    const ids = o.heroes.map((h) => h && h.id);
    const names = ids.map((id) => (DATA.heroes[id] ? DATA.heroes[id].name : String(id)));
    return { chapter: o.chapter, ink: o.ink, heroes: ids, trial: o.trial | 0, daily: !!o.daily, text: `Verse ${o.chapter}, Echo ${o.ink}, ${names[0]} and ${names[1]}` };
  }

  // ---------------------------------------------------------------- stats
  function mergeStats(dst, src) {
    stackKeys().forEach((k) => {
      if (!isNum(src[k])) return;
      dst[k] = isMax(k) ? Math.max(dst[k] || 0, src[k]) : (dst[k] || 0) + src[k];
    });
    return dst;
  }
  function track(stat, n) {
    ensure();
    if (stackKeys().indexOf(stat) < 0) return 0;
    const v = n === undefined ? 1 : n;
    if (!isNum(v)) return P.stats[stat] || 0;
    P.stats[stat] = isMax(stat) ? Math.max(P.stats[stat] || 0, v) : (P.stats[stat] || 0) + v;
    return P.stats[stat];
  }
  function stat(k) {
    ensure();
    return P.stats[k] || 0;
  }
  const curseCount = (R) => (R.deck || []).filter((c) => DATA.cards[c.id] && DATA.cards[c.id].hero === 'curse').length;
  function liveStats(R) {
    const s = Object.assign({}, P.stats);
    if (R && !R.daily) {
      mergeStats(s, R.stats || {});
      if (Array.isArray(R.deck)) {
        s.maxDeck = Math.max(s.maxDeck || 0, R.deck.length);
        s.curseCards = (P.stats.curseCards || 0) + curseCount(R);
      }
    }
    return s;
  }

  // ---------------------------------------------------------------- achievements, heroes, trials
  function heroUnlocked(id) {
    const def = DATA.heroes[id];
    if (!def) return false;
    if (!def.unlock) return true;
    return P.unlocked.hero.indexOf(id) >= 0 || has(P.ach, def.unlock.ach);
  }
  function unlockAchievement(id, now) {
    P.ach[id] = isNum(now) ? now : 0;
    const a = DATA.achievements[id];
    if (a && a.reward && a.reward.inkstones) P.inkstones += a.reward.inkstones;
    const heroes = [];
    Object.keys(DATA.heroes).forEach((hid) => {
      const u = DATA.heroes[hid].unlock;
      if (u && u.ach === id && P.unlocked.hero.indexOf(hid) < 0) { P.unlocked.hero.push(hid); heroes.push(hid); }
    });
    bus.emit('achievement', { id });
    heroes.forEach((hid) => bus.emit('unlock', { kind: 'hero', id: hid }));
  }
  function check(R, now) {
    ensure();
    const s = liveStats(R);
    const won = [];
    Object.keys(DATA.achievements).forEach((id) => {
      const a = DATA.achievements[id];
      if (!a || !a.stat || has(P.ach, id)) return;
      if ((s[a.stat.k] || 0) >= a.stat.gte) { unlockAchievement(id, now); won.push(id); }
    });
    if (won.length) save();
    return won;
  }
  function achievements() {
    ensure();
    const s = liveStats(null);
    return Object.keys(DATA.achievements).map((id) => {
      const a = DATA.achievements[id];
      const value = s[a.stat.k] || 0;
      const done = has(P.ach, id);
      return { id, name: a.name, text: a.text, k: a.stat.k, gte: a.stat.gte, value, progress: done ? 1 : Math.min(1, value / a.stat.gte), done, ts: done ? P.ach[id] : null, reward: a.reward || null };
    });
  }
  function trialMax() {
    ensure();
    return P.stats.wins > 0 ? Math.min(10, (P.stats.trialBest | 0) + 1) : 0;
  }

  // ---------------------------------------------------------------- the Library
  const REG = () => ({ card: DATA.cards, relic: DATA.relics, gem: DATA.gems });
  function libCost(kind, def) {
    const lib = DATA.ECONOMY.library[kind] || {};
    const key = kind === 'gem' ? def.tier : def.rarity;
    if (has(lib, key)) return lib[key];
    const all = Object.keys(lib).map((k) => lib[k]);
    return all.length ? Math.max(...all) : 50;
  }
  function isUnlocked(kind, id) {
    ensure();
    if (kind === 'hero') return heroUnlocked(id);
    if (kind === 'trial') { const n = Number(String(id).replace(/^trial_/, '')); return n === 0 || (isNum(n) && n <= trialMax()); }
    const reg = REG()[kind];
    if (!reg) return true;
    const def = reg[id];
    if (!def || !def.locked) return true;
    return P.unlocked[kind].indexOf(id) >= 0;
  }
  function unlockedSet() {
    ensure();
    const reg = REG();
    const out = {};
    ['card', 'relic', 'gem'].forEach((k) => { out[k] = P.unlocked[k].filter((id) => reg[k][id] && reg[k][id].locked); });
    return out;
  }
  const KIND_ORDER = { card: 0, relic: 1, gem: 2 };
  function libraryList() {
    ensure();
    const reg = REG();
    const out = [];
    ['card', 'relic', 'gem'].forEach((kind) => Object.keys(reg[kind]).forEach((id) => {
      const d = reg[kind][id];
      if (!d || !d.locked) return;
      const cost = libCost(kind, d);
      const unlocked = P.unlocked[kind].indexOf(id) >= 0;
      out.push({ kind, id, cost, unlocked, affordable: !unlocked && P.inkstones >= cost, name: d.name, rarity: kind === 'gem' ? d.tier : d.rarity, hero: d.hero || null });
    }));
    const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);                 // code-unit order: the same on every engine and locale
    out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.cost - b.cost || cmp(String(a.hero), String(b.hero)) || cmp(a.id, b.id));
    return out;
  }
  function buy(kind, id) {
    ensure();
    pull();                                                         // spend what is really there: another tab may have bought or earned since
    const reg = REG()[kind];
    const def = reg && reg[id];
    if (!def || !def.locked) return { ok: false, reason: 'unknown' };
    if (P.unlocked[kind].indexOf(id) >= 0) return { ok: false, reason: 'owned' };
    const cost = libCost(kind, def);
    if (P.inkstones < cost) return { ok: false, reason: 'funds', cost };
    P.inkstones -= cost;
    P.unlocked[kind].push(id);
    save();
    bus.emit('unlock', { kind, id });
    return { ok: true, cost, inkstones: P.inkstones };
  }

  // ---------------------------------------------------------------- ending a run
  function recordRun(R, outcome, now) {
    ensure();
    pull();                                                         // another tab may have paid this very run out already
    const res = { inkstones: 0, bonus: 0, total: P.inkstones, newAchievements: [], newTrial: null, heroesUnlocked: [] };
    if (!R || R.recorded) return res;
    if (runPaid(R.id)) { R.recorded = true; return res; }
    if (outcome !== 'win' && outcome !== 'lose' && outcome !== 'abandon') outcome = R.victory ? 'win' : 'lose';
    const cfg = DATA.ECONOMY.inkstones;
    const win = outcome === 'win', abandon = outcome === 'abandon', daily = !!R.daily;
    const score = RUN.score(R);
    const raw = cfg.perChapter * (R.stats.bossKills | 0) + (win ? cfg.win : 0) + cfg.perTrial * (R.trial | 0) + Math.floor(score / cfg.scoreDiv);
    const earned = Math.floor(raw * (daily ? cfg.dailyMul : 1) * (abandon ? cfg.abandonMul : 1));
    const trialBefore = trialMax();
    const heroesBefore = DATA.LISTS.heroIds.filter(heroUnlocked);
    R.recorded = true;
    P.inkstones += earned;
    if (typeof R.id === 'string' && R.id) { P.paid.unshift(R.id); P.paid.length = Math.min(P.paid.length, PAID_MAX); }
    if (daily) {
      P.stats.dailyRuns += 1;
      P.daily.last = R.seed >>> 0;
    } else {
      mergeStats(P.stats, R.stats || {});
      P.stats.runs += 1;
      if (win) {
        P.stats.wins += 1;
        R.heroes.forEach((h) => { const k = 'wins' + h.id[0].toUpperCase() + h.id.slice(1); if (stackKeys().indexOf(k) >= 0) P.stats[k] += 1; });
        if (R.deck.length <= SMALL_DECK) P.stats.smallDeckWins += 1;
        P.stats.trialBest = Math.max(P.stats.trialBest, R.trial | 0);
      } else if (!abandon) P.stats.deaths += 1;
      P.stats.maxDeck = Math.max(P.stats.maxDeck, R.deck.length);
      P.stats.curseCards += curseCount(R);
    }
    Object.keys(R.foes || {}).forEach((id) => {                        // the bestiary records every run, daily ones too
      P.kills[id] = (P.kills[id] || 0) + (R.foes[id] | 0);
      P.seen[id] = Math.max(P.seen[id] || 0, 1);
    });
    P.history.unshift({ id: R.id, score, heroes: R.heroes.map((h) => h.id), chapter: R.chapter, outcome, trial: R.trial | 0, daily, ts: isNum(now) ? now : 0, seed: R.seed, inkstones: earned });
    if (P.history.length > HISTORY_MAX) P.history.length = HISTORY_MAX;
    const before = P.inkstones;
    res.newAchievements = check(null, now);
    res.bonus = P.inkstones - before;
    res.inkstones = earned;
    res.total = P.inkstones;
    const after = trialMax();
    res.newTrial = after > trialBefore ? after : null;
    res.heroesUnlocked = DATA.LISTS.heroIds.filter((id) => heroUnlocked(id) && heroesBefore.indexOf(id) < 0);
    save();
    return res;
  }

  // ---------------------------------------------------------------- codex, story, tutorial, daily
  function seen(enemyId) {
    ensure();
    if (typeof enemyId !== 'string') return 0;
    P.seen[enemyId] = (P.seen[enemyId] || 0) + 1;
    save();
    return P.seen[enemyId];
  }
  function bestiary() {
    ensure();
    const out = [];
    const listed = {};
    [1, 2, 3].forEach((ch) => DATA.ROSTER[ch].forEach((r) => {
      listed[r.id] = true;
      out.push({ id: r.id, seen: P.seen[r.id] || 0, kills: P.kills[r.id] || 0, chapter: r.chapter, tier: r.tier });
    }));
    Object.keys(DATA.enemies).filter((id) => !listed[id]).forEach((id) => out.push({ id, seen: P.seen[id] || 0, kills: P.kills[id] || 0, chapter: DATA.enemies[id].chapter, tier: DATA.enemies[id].tier }));
    return out;
  }
  const isBark = (id) => /^barks_/.test(id);
  function storyList() {
    ensure();
    const order = DATA.FIXED.lore.filter((id) => !isBark(id));
    Object.keys(DATA.lore).filter((id) => !isBark(id) && order.indexOf(id) < 0).sort().forEach((id) => order.push(id));
    return order.filter((id) => DATA.lore[id]).map((id) => ({ id, seen: !!P.story[id], title: DATA.lore[id].title || id }));
  }
  function loreSeen(id) { ensure(); return !!P.story[id]; }
  function markLore(id) {
    ensure();
    if (typeof id !== 'string' || P.story[id]) return;
    P.story[id] = true;
    save();
  }
  function tutorial(flag) { ensure(); return !!P.tutorial[flag]; }
  function setTutorial(flag, v) {
    ensure();
    if (typeof flag !== 'string') return;
    if (v === false) delete P.tutorial[flag]; else P.tutorial[flag] = true;
    save();
  }
  const dailySeed = (date) => U.dateKey(date);
  const dailyPlayed = (date) => { ensure(); return P.daily.last === U.dateKey(date); };

  return {
    get profile() { ensure(); return P; },
    get inkstones() { ensure(); return P.inkstones; },
    get history() { ensure(); return P.history; },
    bus, load, save, refresh, reset, get, set, saveRun, loadRun, clearRun, hasRun, runPaid, runInfo, track, stat, mergeStats, check, achievements,
    isUnlocked, unlockedSet, libraryList, buy, trialMax, recordRun, seen, bestiary, loreSeen, markLore, storyList,
    dailySeed, dailyPlayed, tutorial, setTutorial,
  };
})();
