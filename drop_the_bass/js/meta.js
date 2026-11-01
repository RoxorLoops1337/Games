// meta.js: the profile (save data) and everything that changes it between runs. Pure functions on a plain object:
// no DOM, no Math.random (callers pass an rng), no Date.now (callers pass `now` in ms).
import {
  GAME, WORLDS, WORLD_BY_ID, ENEMIES, BOSSES, TURRETS, STARTER_TURRETS, RARITY, RARITY_ORDER, ENCORE_MAX, encoreReward, ECON,
} from './data_core.js';
import {
  STUDIO, STUDIO_IDS, HERO_MAX, heroCost, LOADOUT_BASE, AUTOMERGE_PRICE, SLOTS, STATS, SETS, GEAR, GEAR_IDS, GEAR_MAX_LEVEL,
  gearUpgradeCost, GEAR_SELL, CRATES, PITY, fansForLevel, FAME_MAX, fameReward, OUTFITS, LOGIN_REWARDS, QUESTS, ACHIEVEMENTS, STAR_MILESTONES, BOOSTERS, BOOSTER_IDS, WHEEL, WHEEL_SPIN_PRICE,
} from './data_meta.js';
import { DAILY_MODS, DAILY_MOD_IDS } from './data_run.js';
import { makeRng, hashSeed } from './rng.js';
import * as CORE from './data_core.js';
import { WEEKLY_GIGS, WEEKLY_WAVES, WEEKLY_REWARD } from './data_meta.js';
import { cleanName, cleanFriends, addFriend as lbAddFriend, removeFriend as lbRemoveFriend, FRIENDS_MAX } from './lb.js';

const DAY = 86400000;
export const dayOf = (now) => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / DAY);

// ------------------------------------------------------------------------------------------------ profile
export function newProfile(now = 0) {
  const prog = {};
  for (const w of WORLDS) prog[w.id] = { cleared: false, stars: new Array(ENCORE_MAX + 1).fill(0), bestEndless: 0, bestWave: 0 };
  const turretsUnlocked = {};
  for (const t of STARTER_TURRETS) turretsUnlocked[t] = true;
  return {
    v: GAME.version, poolV: 2, created: now, lastSeen: now,
    records: 250, diamonds: 30, fans: 0, fame: 1, name: '', resume: null, boosters: {}, wheel: null, friends: [], weekly: { id: '', done: false, best: 0 },
    studio: {}, heroLv: { roxor: 1, jasmin: 1 },
    turretsUnlocked, loadout: STARTER_TURRETS.slice(),
    prog, bossesSeen: {}, encoreCleared: {},
    gear: { items: [], equipped: { head: null, mic: null, body: null, chain: null, feet: null }, uid: 1 },
    outfits: { owned: { roxor: ['default'], jasmin: ['default'] }, worn: { roxor: 'default', jasmin: 'default' } },
    stats: { kills: 0, merges: 0, deploys: 0, runs: 0, wins: 0, bosses: 0, waves: 0, heroUses: 0, bestCombo: 0, perfects: 0, remixes: 0, maxLevel: 0,
             crates: 0, spins: 0, rushBest: 0, legendary: 0, gearMerges: 0, endless: 0, relics: 0, dailies: 0, duets: 0, flawless: 0, streak: 0, coins: 0, weeklies: 0 },
    achClaimed: {}, starClaimed: {},
    daily: { day: -1, quests: [], rerolled: false, prog: {}, challengeDay: -1, challengeBest: 0 },
    login: { lastDay: -1, streak: 0, claimedDay: -1 },
    crate: { sinceEpic: 0, sinceLegend: 0 },
    tutorial: { done: false, hints: {} },
    story: { intro: false, worlds: {}, ending: false },
    seen: { turrets: {}, enemies: {}, bosses: {}, relics: {} },
    autoMerge: false, autoMergeOn: true,
    settings: { style: 'doodle', lowfx: false, music: 0.7, sfx: 0.9, shake: true, numbers: true, vibrate: true, reduce: false, beat: true, speed: 1, difficulty: 'normal' },
  };
}
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// number clamp: undefined keeps the default, anything that is not a finite number falls back to lo
const num = (v, d, lo = 0, hi = Infinity) => (v === undefined ? d : (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo));
const int = (v, d, lo = 0, hi = Infinity) => Math.floor(num(v, d, lo, hi));

export const DIFFICULTY_IDS = ['easy', 'normal', 'hard'];
const DIFF_FALLBACK = {
  easy:   { id: 'easy',   name: 'Easy',   desc: 'Gentler Static. Good for a chill session.' },
  normal: { id: 'normal', name: 'Normal', desc: 'The standard tour.' },
  hard:   { id: 'hard',   name: 'Hard',   desc: 'Tougher Static, bigger rewards.' },
};
// name and description come from data_core.js DIFFICULTY when it exists, with a safe fallback
export function difficultyInfo(id) {
  const t = CORE.DIFFICULTY && isObj(CORE.DIFFICULTY) ? CORE.DIFFICULTY : null;
  const k = DIFFICULTY_IDS.includes(id) ? id : 'normal';
  const e = t && isObj(t[k]) ? t[k] : {};
  return { id: k, name: typeof e.name === 'string' ? e.name : DIFF_FALLBACK[k].name, desc: typeof e.desc === 'string' ? e.desc : DIFF_FALLBACK[k].desc };
}
export const difficultyOf = (p) => (p && p.settings && DIFFICULTY_IDS.includes(p.settings.difficulty) ? p.settings.difficulty : 'normal');

export function migrate(p, now = 0) {
  const base = newProfile(now);
  if (!isObj(p)) return base;
  const out = Object.assign({}, base, p);
  for (const k of ['settings', 'stats', 'tutorial', 'story', 'seen', 'login', 'daily', 'crate', 'outfits', 'gear', 'heroLv', 'weekly']) out[k] = Object.assign({}, base[k], isObj(p[k]) ? p[k] : {});
  out.prog = Object.assign({}, base.prog);
  for (const w of WORLDS) out.prog[w.id] = Object.assign({}, base.prog[w.id], isObj((p.prog || {})[w.id]) ? p.prog[w.id] : {});
  out.turretsUnlocked = Object.assign({}, base.turretsUnlocked, isObj(p.turretsUnlocked) ? p.turretsUnlocked : {});
  // ---- sanitise types (a damaged or hand-edited save must never poison the game with NaN or strings)
  out.records = int(p.records, base.records); out.diamonds = int(p.diamonds, base.diamonds); out.fans = int(p.fans, base.fans);
  out.fame = int(p.fame, base.fame, 1, FAME_MAX);
  out.created = num(p.created, base.created); out.lastSeen = num(p.lastSeen, base.lastSeen);
  out.name = typeof p.name === 'string' ? cleanName(p.name) : '';
  out.friends = cleanFriends(p.friends);
  out.resume = isObj(p.resume) ? p.resume : null;
  out.boosters = isObj(p.boosters) ? p.boosters : {};
  out.wheel = isObj(p.wheel) ? p.wheel : null;
  out.autoMerge = !!p.autoMerge; out.autoMergeOn = p.autoMergeOn === undefined ? true : !!p.autoMergeOn;
  out.pendingCrates = (Array.isArray(p.pendingCrates) ? p.pendingCrates : []).filter((c) => typeof c === 'string' && CRATES[c]);
  out.studio = {};
  if (isObj(p.studio)) for (const id of STUDIO_IDS) { const l = int(p.studio[id], 0, 0, STUDIO[id].max); if (l > 0) out.studio[id] = l; }
  for (const who of ['roxor', 'jasmin']) out.heroLv[who] = int(out.heroLv[who], 1, 1, HERO_MAX);
  for (const k of Object.keys(base.stats)) out.stats[k] = num(out.stats[k], base.stats[k]);
  for (const k of Object.keys(base.crate)) out.crate[k] = int(out.crate[k], base.crate[k]);
  for (const w of WORLDS) {
    const pr = out.prog[w.id], bs = base.prog[w.id];
    pr.cleared = !!pr.cleared; pr.bestEndless = int(pr.bestEndless, 0); pr.bestWave = int(pr.bestWave, 0);
    pr.stars = bs.stars.map((_, i) => int(Array.isArray(pr.stars) ? pr.stars[i] : 0, 0, 0, 3));
  }
  const s = out.settings, bsn = base.settings;
  s.music = num(s.music, bsn.music, 0, 1); s.sfx = num(s.sfx, bsn.sfx, 0, 1); s.speed = num(s.speed, 1, 1, 3);
  for (const k of ['lowfx', 'shake', 'numbers', 'vibrate', 'reduce', 'beat']) s[k] = !!s[k];
  s.style = s.style === 'classic' ? 'classic' : 'doodle';
  s.difficulty = DIFFICULTY_IDS.includes(s.difficulty) ? s.difficulty : 'normal';
  out.weekly = { id: typeof out.weekly.id === 'string' ? out.weekly.id : '', done: !!out.weekly.done, best: int(out.weekly.best, 0) };
  out.daily.day = num(out.daily.day, -1, -1); out.daily.challengeDay = num(out.daily.challengeDay, -1, -1); out.daily.challengeBest = int(out.daily.challengeBest, 0);
  if (!Array.isArray(out.daily.quests)) out.daily.quests = [];
  out.daily.quests = out.daily.quests.filter((q) => isObj(q) && typeof q.id === 'string');
  if (!isObj(out.daily.prog)) out.daily.prog = {};
  if (!Array.isArray(out.loadout) || !out.loadout.length) out.loadout = STARTER_TURRETS.slice();
  if (!p.poolV) { out.loadout = STARTER_TURRETS.slice(); out.poolV = 2; }   // older saves had a 4 to 8 turret pool: every drop now draws from all of them
  out.loadout = out.loadout.filter((t) => TURRETS[t] && out.turretsUnlocked[t]);
  if (!out.loadout.length) out.loadout = STARTER_TURRETS.slice();
  if (!Array.isArray(out.gear.items)) out.gear.items = [];
  out.gear.items = out.gear.items.filter((g) => isObj(g) && GEAR[g.tpl] && RARITY[g.rarity]).map((g) => Object.assign({}, g, { lvl: int(g.lvl, 1, 1, GEAR_MAX_LEVEL) }));
  out.gear.equipped = Object.assign({}, base.gear.equipped, isObj(p.gear && p.gear.equipped) ? p.gear.equipped : {});
  for (const sl of SLOTS) if (out.gear.equipped[sl] != null && !out.gear.items.some((g) => g.uid === out.gear.equipped[sl])) out.gear.equipped[sl] = null;
  out.gear.uid = Math.max(int(out.gear.uid, 1, 1), 1 + out.gear.items.reduce((m, g) => Math.max(m, +g.uid || 0), 0));
  out.v = GAME.version;
  return out;
}
export function serialize(p) { return JSON.stringify(p); }
// a raw (already JSON parsed) value that plausibly is a Drop the Bass save: an object with stats and either prog or records
export function looksLikeSave(raw) { return isObj(raw) && isObj(raw.stats) && (isObj(raw.prog) || typeof raw.records === 'number'); }
export function parseSave(str, now = 0) {
  try {
    if (typeof str !== 'string' || !str.trim()) return null;
    const raw = JSON.parse(str);
    return looksLikeSave(raw) ? migrate(raw, now) : null;
  } catch (e) { return null; }
}
// repair a live profile in place (NaN, strings in number fields...) so the next save can pass validation
export function repairProfile(p, now = 0) {
  const fixed = migrate(JSON.parse(JSON.stringify(p, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 0 : v))), now);
  for (const k of Object.keys(p)) delete p[k];
  Object.assign(p, fixed);
  return p;
}

// ---- save storage: validate-then-commit with a second copy of the last good save
export const SAVE_KEY = GAME.saveKey;
export const SAVE_BAK_KEY = GAME.saveKey + '_bak';         // last good save (no run snapshot)
export const SAVE_PREV_KEY = GAME.saveKey + '_prev';       // the profile that was replaced by an import or a reset
export const SAVE_CORRUPT_KEY = GAME.saveKey + '_corrupt'; // an unreadable main save, kept for manual rescue
const safeGet = (store, k) => { try { return store.getItem(k); } catch (e) { return null; } };
const safeSet = (store, k, v) => { try { store.setItem(k, v); return true; } catch (e) { return false; } };
export function progressScore(p) {
  if (!isObj(p)) return 0;
  const st = isObj(p.stats) ? p.stats : {}, studio = isObj(p.studio) ? p.studio : {};
  let n = (+st.runs || 0) * 3 + (+st.kills || 0) / 200 + (+p.fame || 0) * 10 + (+p.fans || 0) / 50;
  for (const k of Object.keys(studio)) n += +studio[k] || 0;
  if (isObj(p.prog)) for (const w of Object.keys(p.prog)) if (p.prog[w] && p.prog[w].cleared) n += 25;
  return n;
}
// Serialise, parse it back and check the shape BEFORE touching storage. A bad profile never overwrites a good save.
// Returns { ok, reason?, bytes? }. opts.force = replace the backup even if the new save has less progress (reset, import).
export function commitSave(store, p, opts = {}) {
  let str, raw;
  try { str = serialize(p); raw = JSON.parse(str); } catch (e) { return { ok: false, reason: 'serialize' }; }
  if (!looksLikeSave(raw)) return { ok: false, reason: 'shape' };
  for (const k of ['records', 'diamonds', 'fans', 'fame']) if (typeof raw[k] !== 'number' || !Number.isFinite(raw[k]) || raw[k] < 0) return { ok: false, reason: 'bad_' + k };
  if (!isObj(raw.settings) || !isObj(raw.studio) || !isObj(raw.gear)) return { ok: false, reason: 'shape' };
  // the backup first (without the run snapshot, so it stays small), unless it would replace a far more advanced one
  const slim = Object.assign({}, raw, { resume: null });
  const oldBak = safeGet(store, SAVE_BAK_KEY);
  let keepBak = false;
  if (oldBak && !opts.force) { const ob = parseSave(oldBak, 0); if (ob && progressScore(ob) > 20 && progressScore(slim) < progressScore(ob) * 0.5) keepBak = true; }
  if (!keepBak) safeSet(store, SAVE_BAK_KEY, JSON.stringify(slim));
  if (!safeSet(store, SAVE_KEY, str)) return { ok: false, reason: 'storage' };
  if (safeGet(store, SAVE_KEY) !== str) return { ok: false, reason: 'verify' };
  return { ok: true, bytes: str.length, keptBackup: keepBak };
}
// Load: the main save, else the backup (recovered:true), else a new profile. A corrupt main save is kept under SAVE_CORRUPT_KEY.
export function loadSave(store, now = 0) {
  const rawMain = safeGet(store, SAVE_KEY), rawBak = safeGet(store, SAVE_BAK_KEY);
  const main = rawMain ? parseSave(rawMain, now) : null;
  if (main) return { profile: main, source: 'main', recovered: false, corrupt: false, hadSave: true };
  const corrupt = !!rawMain;
  if (corrupt) safeSet(store, SAVE_CORRUPT_KEY, rawMain);
  const bak = rawBak ? parseSave(rawBak, now) : null;
  if (bak) return { profile: bak, source: 'backup', recovered: true, corrupt, hadSave: true };
  return { profile: newProfile(now), source: 'new', recovered: false, corrupt, hadSave: false };
}

// ---- save code: DTB1.<base64>.<checksum>. Old raw base64 codes still import. The run snapshot is left out.
const b64enc = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
const b64dec = (s) => (typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'));
export function checksum(s) { let a = 0x811c9dc5; for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 16777619) >>> 0; } return a.toString(36); }
export function exportCode(p) {
  const s = JSON.stringify(Object.assign({}, p, { resume: null }));
  const body = b64enc(s);
  return 'DTB1.' + body + '.' + checksum(body);
}
export function importCode(code, now = 0) {
  try {
    if (typeof code !== 'string') return null;
    let c = code.replace(/[\s"'`]/g, '');
    if (!c) return null;
    if (c.startsWith('DTB1.')) {
      const parts = c.split('.');
      if (parts.length !== 3 || checksum(parts[1]) !== parts[2]) return null;   // truncated or edited
      c = parts[1];
    }
    c = c.replace(/-/g, '+').replace(/_/g, '/');
    const raw = JSON.parse(b64dec(c));
    if (!looksLikeSave(raw)) return null;
    const p = migrate(raw, now); p.resume = null;
    return p;
  } catch (e) { return null; }
}

// ---- resume safety net: reject a run snapshot that cannot be played (NaN, missing fields, born times after the run clock)
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
export function checkResume(r) {
  const bad = (reason) => ({ ok: false, reason });
  if (!isObj(r)) return bad('no resume');
  if (!isObj(r.cfg) || typeof r.cfg.mode !== 'string' || !WORLD_BY_ID[r.cfg.world]) return bad('missing run setup');
  const s = r.snap;
  if (!isObj(s)) return bad('missing snapshot');
  if (!isObj(s.opts) || !WORLD_BY_ID[s.opts.world]) return bad('missing stage');
  for (const k of ['t', 'coins', 'stageHp', 'stageMax', 'wave', 'cleared', 'hype', 'hypeNeed', 'uid', 'rngState', 'prepT']) if (!fin(s[k])) return bad('bad ' + k);
  if (s.t < 0 || s.coins < 0 || s.stageMax <= 0 || s.stageHp < 0 || s.stageHp > s.stageMax + 50 || s.wave < 0 || s.wave > 500) return bad('impossible numbers');
  if (s.phase !== 'prep' && s.phase !== 'wave') return bad('bad phase');
  if (!Array.isArray(s.turrets) || !Array.isArray(s.enemies) || !Array.isArray(s.spawnQ) || !Array.isArray(s.projectiles) || !Array.isArray(s.loadout)) return bad('missing lists');
  if (!isObj(s.mods) || !isObj(s.heroLv)) return bad('missing mods');
  if (s.turrets.length > 70) return bad('too many turrets');
  const slots = new Set();
  for (const t of s.turrets) {
    if (!isObj(t) || !TURRETS[t.type]) return bad('unknown turret');
    if (!fin(t.level) || t.level < 1 || t.level > 7 || !fin(t.slot) || t.slot < 0 || slots.has(t.slot)) return bad('bad turret');
    if (!fin(t.x) || !fin(t.y) || !fin(t.born) || !fin(t.cd)) return bad('bad turret numbers');
    if (t.born > s.t + 0.001) return bad('turret born after the run clock');
    slots.add(t.slot);
  }
  for (const e of s.enemies) {
    if (!isObj(e) || typeof e.type !== 'string') return bad('bad enemy');
    if (!fin(e.hp) || !fin(e.maxHp) || e.maxHp <= 0 || !fin(e.x) || !fin(e.y) || !fin(e.d) || !fin(e.speed)) return bad('bad enemy numbers');
  }
  for (const q of s.spawnQ) if (!isObj(q) || !fin(q.at) || typeof q.type !== 'string') return bad('bad spawn queue');
  return { ok: true };
}
export function resumeSummary(r) {
  if (!isObj(r)) return null;
  const w = WORLD_BY_ID[r.world] || WORLD_BY_ID[r.cfg && r.cfg.world];
  const turrets = r.snap && Array.isArray(r.snap.turrets) ? r.snap.turrets.length : 0;
  return { stage: w ? w.name : 'Unknown stage', wave: +r.wave || 0, turrets, mode: r.mode || (r.cfg && r.cfg.mode) || 'story' };
}

// ---- friends (names only; pure helpers live in lb.js)
export function addFriend(p, name) { const r = lbAddFriend(p.friends, name, p.name); if (r.ok) p.friends = r.list; return r; }
export function removeFriend(p, name) { p.friends = lbRemoveFriend(p.friends, name); return p.friends; }
export { FRIENDS_MAX };

// ------------------------------------------------------------------------------------------------ studio, heroes, turrets
export const studioLevel = (p, id) => p.studio[id] || 0;
export function studioCost(p, id) { const u = STUDIO[id]; const l = studioLevel(p, id); return l >= u.max ? null : u.cost(l); }
export function buyStudio(p, id) {
  const u = STUDIO[id]; if (!u) return { ok: false, reason: 'unknown' };
  const c = studioCost(p, id);
  if (c == null) return { ok: false, reason: 'max' };
  if (p.records < c) return { ok: false, reason: 'records', cost: c };
  p.records -= c; p.studio[id] = studioLevel(p, id) + 1;
  return { ok: true, cost: c };
}
export const loadoutSize = () => LOADOUT_BASE;
export function heroUpgradeCost(p, who) { const l = p.heroLv[who]; return l >= HERO_MAX ? null : heroCost(l); }
export function upgradeHero(p, who) {
  const c = heroUpgradeCost(p, who);
  if (c == null) return { ok: false, reason: 'max' };
  if (p.records < c) return { ok: false, reason: 'records', cost: c };
  p.records -= c; p.heroLv[who]++;
  return { ok: true, cost: c };
}
export function canUnlockTurret(p, id) {
  const t = TURRETS[id];
  if (p.turretsUnlocked[id]) return { ok: false, reason: 'owned' };
  if (p.fame < t.unlock.fame) return { ok: false, reason: 'fame', need: t.unlock.fame };
  if (p.records < t.unlock.records) return { ok: false, reason: 'records', need: t.unlock.records };
  return { ok: true };
}
export function unlockTurret(p, id) {
  const c = canUnlockTurret(p, id);
  if (!c.ok) return c;
  p.records -= TURRETS[id].unlock.records; p.turretsUnlocked[id] = true;
  if (p.loadout.length < loadoutSize(p)) p.loadout.push(id);
  return { ok: true };
}
export function setLoadout(p, ids) {
  const clean = [];
  for (const id of ids) if (TURRETS[id] && p.turretsUnlocked[id] && !clean.includes(id)) clean.push(id);
  if (!clean.length) return false;
  p.loadout = clean.slice(0, loadoutSize(p));
  return true;
}
export function toggleLoadout(p, id) {
  if (!p.turretsUnlocked[id]) return false;
  const i = p.loadout.indexOf(id);
  if (i >= 0) { if (p.loadout.length <= 1) return false; p.loadout.splice(i, 1); return true; }
  if (p.loadout.length >= loadoutSize(p)) return false;
  p.loadout.push(id); return true;
}
export function buyAutoMerge(p) {
  if (p.autoMerge) return { ok: false, reason: 'owned' };
  if (p.diamonds < AUTOMERGE_PRICE) return { ok: false, reason: 'diamonds' };
  p.diamonds -= AUTOMERGE_PRICE; p.autoMerge = true; return { ok: true };
}
export function buyOutfit(p, who, id) {
  const o = OUTFITS[who] && OUTFITS[who][id];
  if (!o) return { ok: false };
  if (p.outfits.owned[who].includes(id)) { p.outfits.worn[who] = id; return { ok: true, equipped: true }; }
  if (p.diamonds < o.price) return { ok: false, reason: 'diamonds' };
  p.diamonds -= o.price; p.outfits.owned[who].push(id); p.outfits.worn[who] = id;
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------ gear
const rarIdx = (r) => RARITY_ORDER.indexOf(r);
export function statValue(stat, rarity, lvl) { return STATS[stat].base * RARITY[rarity].mult * (1 + 0.1 * (lvl - 1)); }
export function gearStatLines(item) {
  const t = GEAR[item.tpl];
  const lines = [{ stat: t.main, value: statValue(t.main, item.rarity, item.lvl), main: true }];
  if (rarIdx(item.rarity) >= 2) lines.push({ stat: t.sub, value: statValue(t.sub, item.rarity, item.lvl) * 0.6, main: false });
  return lines;
}
export function fmtStat(stat, value) {
  const s = STATS[stat];
  return s.fmt === 'pct' ? '+' + (value * 100).toFixed(value * 100 >= 10 ? 0 : 1).replace(/\.0$/, '') + '%' : '+' + Math.round(value);
}
export function makeGear(p, tpl, rarity) {
  const g = { uid: p.gear.uid++, tpl, rarity, lvl: 1, fresh: true };
  p.gear.items.push(g);
  return g;
}
export const gearById = (p, uid) => p.gear.items.find((g) => g.uid === uid) || null;
export function equipGear(p, uid) {
  const g = gearById(p, uid); if (!g) return false;
  p.gear.equipped[GEAR[g.tpl].slot] = uid; return true;
}
export function unequipSlot(p, slot) { p.gear.equipped[slot] = null; }
export function upgradeCostOf(item) { return item.lvl >= GEAR_MAX_LEVEL ? null : gearUpgradeCost(rarIdx(item.rarity), item.lvl); }
export function upgradeGear(p, uid) {
  const g = gearById(p, uid); if (!g) return { ok: false };
  const c = upgradeCostOf(g);
  if (c == null) return { ok: false, reason: 'max' };
  if (p.records < c) return { ok: false, reason: 'records', cost: c };
  p.records -= c; g.lvl++; return { ok: true, cost: c };
}
// merge three of the same template and rarity into one of the next rarity (keeps the best level, minus a few)
export function canMergeGear(p, uids) {
  if (!uids || uids.length !== 3 || new Set(uids).size !== 3) return false;
  const gs = uids.map((u) => gearById(p, u));
  if (gs.some((g) => !g)) return false;
  if (!gs.every((g) => g.tpl === gs[0].tpl && g.rarity === gs[0].rarity)) return false;
  return rarIdx(gs[0].rarity) < RARITY_ORDER.length - 1;
}
export function mergeGear(p, uids) {
  if (!canMergeGear(p, uids)) return { ok: false };
  const gs = uids.map((u) => gearById(p, u));
  const best = Math.max(...gs.map((g) => g.lvl));
  const wasEquipped = gs.find((g) => p.gear.equipped[GEAR[g.tpl].slot] === g.uid);
  for (const g of gs) { p.gear.items.splice(p.gear.items.indexOf(g), 1); }
  const ng = makeGear(p, gs[0].tpl, RARITY_ORDER[rarIdx(gs[0].rarity) + 1]);
  ng.lvl = Math.max(1, best - 2);
  if (wasEquipped) p.gear.equipped[GEAR[ng.tpl].slot] = ng.uid;
  p.stats.gearMerges++;
  if (ng.rarity === 'legendary' || ng.rarity === 'mythic') p.stats.legendary++;
  return { ok: true, item: ng };
}
export function scrapGear(p, uid) {
  const g = gearById(p, uid); if (!g) return { ok: false };
  const slot = GEAR[g.tpl].slot;
  if (p.gear.equipped[slot] === uid) p.gear.equipped[slot] = null;
  p.gear.items.splice(p.gear.items.indexOf(g), 1);
  const v = GEAR_SELL[g.rarity] + Math.round(((g.lvl - 1) * gearUpgradeCost(rarIdx(g.rarity), 1)) * 0.4);
  p.records += v; return { ok: true, value: v };
}
// groups of 3+ identical items that can be merged right now
export function mergeableGear(p) {
  const by = new Map();
  for (const g of p.gear.items) { const k = g.tpl + ':' + g.rarity; if (!by.has(k)) by.set(k, []); by.get(k).push(g); }
  const out = [];
  for (const list of by.values()) if (list.length >= 3 && rarIdx(list[0].rarity) < RARITY_ORDER.length - 1) out.push(list);
  return out;
}
export function setCounts(p) {
  const c = {};
  for (const s of SLOTS) { const g = gearById(p, p.gear.equipped[s]); if (g && GEAR[g.tpl].set) c[GEAR[g.tpl].set] = (c[GEAR[g.tpl].set] || 0) + 1; }
  return c;
}
export function setBonuses(p) {
  const out = [];
  const counts = setCounts(p);
  for (const [sid, n] of Object.entries(counts)) for (const th of [2, 3, 5]) if (n >= th) out.push({ set: sid, count: th, ...SETS[sid].bonus[th] });
  return out;
}
export function gearTotals(p) {
  const tot = {};
  for (const s of SLOTS) {
    const g = gearById(p, p.gear.equipped[s]); if (!g) continue;
    for (const l of gearStatLines(g)) tot[l.stat] = (tot[l.stat] || 0) + l.value;
  }
  for (const b of setBonuses(p)) tot[b.stat] = (tot[b.stat] || 0) + b.v;
  return tot;
}

// ------------------------------------------------------------------------------------------------ crates
export function rollRarity(odds, rng, minRarity = null) {
  const items = RARITY_ORDER.filter((r) => odds[r] > 0 && (!minRarity || rarIdx(r) >= rarIdx(minRarity)));
  return rng.weighted(items, (r) => odds[r]);
}
export function rollGearItem(p, tierOrOdds, rng, opts = {}) {
  const odds = typeof tierOrOdds === 'string' ? CRATES[tierOrOdds].odds : tierOrOdds;
  let rar = rollRarity(odds, rng, opts.min || null);
  if (!opts.noPity) {
    if (p.crate.sinceLegend + 1 >= PITY.legendaryEvery && rarIdx(rar) < 3) rar = 'legendary';
    else if (p.crate.sinceEpic + 1 >= PITY.epicEvery && rarIdx(rar) < 2) rar = 'epic';
    if (rarIdx(rar) >= 3) p.crate.sinceLegend = 0; else p.crate.sinceLegend++;
    if (rarIdx(rar) >= 2) p.crate.sinceEpic = 0; else p.crate.sinceEpic++;
  }
  const tpl = rng.pick(GEAR_IDS);
  const g = makeGear(p, tpl, rar);
  if (rarIdx(rar) >= 3) p.stats.legendary++;
  return g;
}
export function canAfford(p, price) { return (!price.records || p.records >= price.records) && (!price.diamonds || p.diamonds >= price.diamonds); }
export function buyCrate(p, tier, rng) {
  const c = CRATES[tier]; if (!c) return { ok: false };
  if (!canAfford(p, c.price)) return { ok: false, reason: 'funds' };
  if (c.price.records) p.records -= c.price.records;
  if (c.price.diamonds) p.diamonds -= c.price.diamonds;
  return { ok: true, items: openCrateFree(p, tier, rng) };
}
export function openCrateFree(p, tier, rng) {
  const c = CRATES[tier];
  const items = [];
  for (let i = 0; i < c.items; i++) {
    const min = c.guarantee && i === c.items - 1 && !items.some((g) => rarIdx(g.rarity) >= rarIdx(c.guarantee)) ? c.guarantee : null;
    items.push(rollGearItem(p, c.odds, rng, { min }));
  }
  p.stats.crates++;
  return items;
}
export function crateOddsTable(tier) {
  const c = CRATES[tier]; const tot = RARITY_ORDER.reduce((a, r) => a + (c.odds[r] || 0), 0);
  return RARITY_ORDER.filter((r) => c.odds[r] > 0).map((r) => ({ rarity: r, pct: (c.odds[r] / tot) * 100 }));
}

// ------------------------------------------------------------------------------------------------ fame
export function fansToNext(p) { return p.fame >= FAME_MAX ? Infinity : fansForLevel(p.fame); }
export function addFans(p, n, rng) {
  const ups = [];
  p.fans += Math.max(0, Math.round(n));
  while (p.fame < FAME_MAX && p.fans >= fansForLevel(p.fame)) {
    p.fans -= fansForLevel(p.fame); p.fame++;
    const r = fameReward(p.fame);
    p.diamonds += r.diamonds; p.records += r.records;
    const loot = [];
    if (r.crate && rng) for (const g of openCrateFree(p, r.crate, rng)) loot.push(g);
    ups.push({ level: p.fame, reward: r, loot });
  }
  return ups;
}

// ------------------------------------------------------------------------------------------------ progress and unlocks
export const worldIndex = (id) => WORLDS.findIndex((w) => w.id === id);
export function worldUnlocked(p, id) { const i = worldIndex(id); return i === 0 || p.prog[WORLDS[i - 1].id].cleared; }
export function encoreUnlocked(p, id, e) { return e === 0 || (p.prog[id].stars[e - 1] || 0) > 0; }
export function totalStars(p) { let n = 0; for (const w of WORLDS) for (const s of p.prog[w.id].stars) n += s; return n; }
export function clearedCount(p) { return WORLDS.filter((w) => p.prog[w.id].cleared).length; }
export const endlessUnlocked = (p) => p.prog.garage.cleared;
export function highestUnlockedWorld(p) { let h = 0; WORLDS.forEach((w, i) => { if (worldUnlocked(p, w.id)) h = i; }); return h; }

// ------------------------------------------------------------------------------------------------ base fx for a run
export function scaleFx(fx, n) {
  return fx.map(([path, op, v]) => [path, op, op === 'mul' ? Math.pow(v, n) : op === 'add' ? v * n : v]);
}
export function computeRunSetup(p) {
  const fx = [];
  for (const id of STUDIO_IDS) { const l = studioLevel(p, id); if (l > 0 && STUDIO[id].fx.length) fx.push(...scaleFx(STUDIO[id].fx, l)); }
  for (const s of SLOTS) {
    const g = gearById(p, p.gear.equipped[s]); if (!g) continue;
    for (const l of gearStatLines(g)) fx.push(...STATS[l.stat].fx(l.value));
  }
  for (const b of setBonuses(p)) fx.push(...STATS[b.stat].fx(b.v));
  return { baseFx: fx, heroLv: Object.assign({}, p.heroLv), loadout: p.loadout.slice(), autoMerge: p.autoMerge, autoMergeOn: p.autoMergeOn, difficulty: difficultyOf(p) };
}

// ------------------------------------------------------------------------------------------------ daily: login, quests, challenge
export function ensureDaily(p, now, rng) {
  const day = dayOf(now);
  if (p.daily.day === day && p.daily.quests.length) return false;
  const r = rng || makeRng(hashSeed('quests' + day));
  const pool = r.shuffle(QUESTS);
  const picked = []; const stats = new Set();
  for (const q of pool) { if (stats.has(q.stat)) continue; stats.add(q.stat); picked.push({ id: q.id, claimed: false }); if (picked.length >= 3) break; }
  p.daily.day = day; p.daily.quests = picked; p.daily.rerolled = false; p.daily.prog = {};
  return true;
}
export const questDef = (id) => QUESTS.find((q) => q.id === id);
export function questProgress(p, q) { return Math.min(q.goal, p.daily.prog[q.stat] || 0); }
export function claimQuest(p, id) {
  const slot = p.daily.quests.find((x) => x.id === id); const q = questDef(id);
  if (!slot || !q || slot.claimed || questProgress(p, q) < q.goal) return { ok: false };
  slot.claimed = true; grant(p, q.reward); return { ok: true, reward: q.reward };
}
export function rerollQuest(p, id, rng) {
  if (p.daily.rerolled) return { ok: false, reason: 'used' };
  const slot = p.daily.quests.find((x) => x.id === id); if (!slot || slot.claimed) return { ok: false };
  const have = new Set(p.daily.quests.map((x) => questDef(x.id).stat));
  const opts = QUESTS.filter((q) => !have.has(q.stat));
  if (!opts.length) return { ok: false };
  slot.id = rng.pick(opts).id; p.daily.rerolled = true; return { ok: true };
}
export function grant(p, reward, rng) {
  const out = { loot: [] };
  if (reward.records) p.records += reward.records;
  if (reward.diamonds) p.diamonds += reward.diamonds;
  if (reward.fans) addFans(p, reward.fans, rng);
  if (reward.crate && rng) out.loot = openCrateFree(p, reward.crate, rng);
  else if (reward.crate) p.pendingCrates = (p.pendingCrates || []).concat([reward.crate]);
  return out;
}
export function loginStatus(p, now) {
  const day = dayOf(now);
  const claimable = p.login.claimedDay !== day;
  let streak = p.login.streak;
  if (p.login.lastDay !== day) streak = p.login.lastDay === day - 1 ? p.login.streak + 1 : 1;
  const idx = ((streak - 1) % 7 + 7) % 7;
  return { claimable, streak, day, reward: LOGIN_REWARDS[idx], idx };
}
export function claimLogin(p, now, rng) {
  const st = loginStatus(p, now);
  if (!st.claimable) return { ok: false };
  p.login.lastDay = st.day; p.login.claimedDay = st.day; p.login.streak = st.streak;
  p.stats.streak = Math.max(p.stats.streak, st.streak);
  const g = grant(p, st.reward, rng);
  return { ok: true, streak: st.streak, reward: st.reward, loot: g.loot };
}
export function dailyChallenge(p, now) {
  const day = dayOf(now);
  const r = makeRng(hashSeed('daily' + day));
  const mod = DAILY_MOD_IDS[Math.floor(r.next() * DAILY_MOD_IDS.length)];
  const maxW = highestUnlockedWorld(p);
  const world = WORLDS[Math.floor(r.next() * (maxW + 1))].id;
  return { day, mod, world, seed: hashSeed('dailyseed' + day), waves: 15, done: p.daily.challengeDay === day };
}
// ---- Weekly Gig: one fixed run per ISO week (UTC), same seed and mods for everybody, 25 waves, one big reward claim per week
export function isoWeek(now) {
  const d = new Date(now), t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(t).getUTCDay() + 6) % 7;                 // Monday = 0
  const thu = t + (3 - dow) * DAY, year = new Date(thu).getUTCFullYear();
  const week = Math.floor((thu - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return { year, week, id: year + '-W' + String(week).padStart(2, '0'), start: t - dow * DAY, end: t - dow * DAY + 7 * DAY };
}
export function weeklyGig(p, now) {
  const w = isoWeek(now);
  const gig = WEEKLY_GIGS[(w.year * 53 + w.week) % WEEKLY_GIGS.length];
  const mine = p && p.weekly && p.weekly.id === w.id ? p.weekly : null;
  return { id: w.id, week: w.week, gig, name: gig.name, mod: gig.mod, world: gig.world, extra: gig.extra, seed: hashSeed('weekly' + w.id), waves: WEEKLY_WAVES,
    done: !!(mine && mine.done), best: mine ? mine.best : 0, endsAt: w.end, msLeft: Math.max(0, w.end - now) };
}
export function weeklyRewards(result, first) {
  const R = WEEKLY_REWARD, c = result.cleared;
  const o = { diamonds: R.diamonds + c * R.perWave + (result.won ? R.winDiamonds : 0), records: R.records + c * R.perWaveRecords, fans: R.fans, crate: (result.won || c >= R.crateMinWaves) ? R.crate : null };
  if (!first) { o.diamonds = 0; o.crate = null; o.records = 0; o.fans = 0; }
  return o;
}
export function offlineRate(p) { return 18 + 6 * p.fame + 14 * studioLevel(p, 'stream'); }
export function offlineCapHours(p) { return 6 + 2 * studioLevel(p, 'stream'); }
export function offlineRecords(p, now) {
  const hrs = Math.max(0, Math.min(offlineCapHours(p), (now - p.lastSeen) / 3600000));
  return Math.floor(hrs * offlineRate(p));
}
export function claimOffline(p, now) {
  const v = offlineRecords(p, now); p.lastSeen = now; p.records += v; return v;
}

// ------------------------------------------------------------------------------------------------ achievements and star milestones
export function statValueOf(p, stat) {
  if (stat === 'worlds') return clearedCount(p);
  if (stat === 'stars') return totalStars(p);
  if (stat === 'fame') return p.fame;
  if (stat === 'streak') return Math.max(p.stats.streak, p.login.streak);
  if (stat === 'seenEnemies') return Object.keys(ENEMIES).filter((k) => !ENEMIES[k].hidden && p.seen.enemies[k]).length;
  if (stat === 'seenBosses') return Object.keys(BOSSES).filter((k) => p.seen.bosses[k] || p.bossesSeen[k]).length;
  if (stat === 'turretsOwned') return Object.keys(p.turretsUnlocked).filter((k) => p.turretsUnlocked[k]).length;
  return p.stats[stat] || 0;
}
export function achievementState(p, a) {
  const v = statValueOf(p, a.stat);
  return { value: Math.min(v, a.goal), done: v >= a.goal, claimed: !!p.achClaimed[a.id] };
}
export function claimAchievement(p, id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) return { ok: false };
  const s = achievementState(p, a);
  if (!s.done || s.claimed) return { ok: false };
  p.achClaimed[id] = true; p.diamonds += a.diamonds; return { ok: true, diamonds: a.diamonds };
}
export const claimableAchievements = (p) => ACHIEVEMENTS.filter((a) => { const s = achievementState(p, a); return s.done && !s.claimed; });
export function claimStarMilestone(p, stars, rng) {
  const m = STAR_MILESTONES.find((x) => x.stars === stars);
  if (!m || p.starClaimed[stars] || totalStars(p) < stars) return { ok: false };
  p.starClaimed[stars] = true; const g = grant(p, m.reward, rng);
  return { ok: true, reward: m.reward, loot: g.loot };
}
export function readyBadges(p, now) {
  const login = loginStatus(p, now);
  const quests = p.daily.quests.filter((s) => !s.claimed && questProgress(p, questDef(s.id)) >= questDef(s.id).goal).length;
  const ach = claimableAchievements(p).length;
  const stars = STAR_MILESTONES.filter((m) => !p.starClaimed[m.stars] && totalStars(p) >= m.stars).length;
  return { login: login.claimable ? 1 : 0, quests, ach, stars, goals: (login.claimable ? 1 : 0) + quests + ach + stars };
}

// ------------------------------------------------------------------------------------------------ run results
export function runRewards(result) {
  const w = WORLD_BY_ID[result.world]; const n = w.n;
  const base = result.cleared * 10 + result.kills * 0.35 + (result.won ? 120 : 0);
  let mult = Math.pow(n, 1.25) * encoreReward(result.encore || 0);
  if (result.endless) mult *= 0.8;
  const records = Math.round(base * mult);
  const fans = Math.round((result.cleared * 4 + (result.won ? 60 : 0)) * Math.pow(n, 0.6) * (1 + 0.2 * (result.encore || 0)));
  return { records, fans };
}
export function applyRunResult(p, result, rng, now = 0) {
  const out = { records: 0, fans: 0, diamonds: 0, loot: [], levelUps: [], newStars: 0, firstClear: false, unlockedWorld: null, firstBosses: [], challenge: null, newBestEndless: false };
  const w = WORLD_BY_ID[result.world];
  const rw = runRewards(result);
  let records = rw.records, fans = rw.fans;
  const pr = p.prog[w.id];
  const S = p.stats;
  S.runs++; S.kills += result.kills; S.merges += result.merges; S.deploys += result.deploys; S.waves += result.cleared;
  S.bosses += result.bossKills; S.heroUses += result.heroUses || 0; S.perfects += result.perfects || 0; S.remixes += result.remixes || 0;
  S.duets += result.duets || 0; S.relics += (result.relics || []).length;
  S.bestCombo = Math.max(S.bestCombo, result.bestCombo); S.maxLevel = Math.max(S.maxLevel, result.maxLevel || 0);
  S.coins += result.coinsEarned || 0;
  // daily quest progress
  const dp = p.daily.prog;
  const add = (k, v) => { dp[k] = (dp[k] || 0) + v; };
  add('kills', result.kills); add('merges', result.merges); add('deploys', result.deploys); add('runs', 1); add('waves', result.cleared);
  add('bosses', result.bossKills); add('heroUses', result.heroUses || 0); add('perfects', result.perfects || 0); add('remixes', result.remixes || 0);
  if (result.won) add('wins', 1);
  dp.bestCombo = Math.max(dp.bestCombo || 0, result.bestCombo); dp.maxLevel = Math.max(dp.maxLevel || 0, result.maxLevel || 0);
  // bosses seen for the first time
  for (const b of result.bossTypes || []) if (!p.bossesSeen[b]) { p.bossesSeen[b] = true; out.firstBosses.push(b); out.diamonds += 8; }
  if (result.mode === 'story') {
    pr.bestWave = Math.max(pr.bestWave, result.cleared);
    if (result.won) {
      S.wins++;
      if (result.leaks === 0) S.flawless++;
      const e = result.encore || 0;
      const had = pr.stars[e] || 0;
      if (result.stars > had) {
        out.newStars = result.stars - had; pr.stars[e] = result.stars;
        out.diamonds += out.newStars * 5;
      }
      if (!pr.cleared) {
        pr.cleared = true; out.firstClear = true; out.diamonds += 25 + 5 * w.n;
        const i = worldIndex(w.id);
        if (i + 1 < WORLDS.length) out.unlockedWorld = WORLDS[i + 1].id;
      }
      if (e > 0 && had === 0) out.diamonds += 10 + 5 * e;
    }
  } else if (result.mode === 'endless') {
    if (result.cleared > pr.bestEndless) { pr.bestEndless = result.cleared; out.newBestEndless = true; }
    S.endless = Math.max(S.endless, result.cleared);
  } else if (result.mode === 'rush') {
    S.rushBest = Math.max(S.rushBest || 0, result.bossKills);
    out.diamonds += result.bossKills * 3 + (result.won ? 25 : 0);
  } else if (result.mode === 'daily' && result.weekly) {
    const wid = String(result.weekId || '');
    const first = !(p.weekly && p.weekly.id === wid && p.weekly.done);
    const wr = weeklyRewards(result, first);
    out.challenge = { first, weekly: true, bonus: { diamonds: wr.diamonds, records: wr.records, fans: wr.fans, crate: wr.crate } };
    if (first) {
      S.weeklies = (S.weeklies || 0) + 1;
      out.diamonds += wr.diamonds; records += wr.records; fans += wr.fans;
      if (wr.crate) p.pendingCrates = (p.pendingCrates || []).concat([wr.crate]);
    } else { records = Math.round(records * 0.5); fans = Math.round(fans * 0.5); }
    p.weekly = { id: wid, done: true, best: Math.max(p.weekly && p.weekly.id === wid ? p.weekly.best : 0, result.cleared) };
  } else if (result.mode === 'daily') {
    out.challenge = { first: p.daily.challengeDay !== dayOf(now) };
    if (out.challenge.first) {
      p.daily.challengeDay = dayOf(now); S.dailies++;
      const d = 6 + Math.floor(result.cleared / 3) + (result.won ? 8 : 0);
      out.diamonds += d; records += 150 + result.cleared * 20; fans += 30;
      out.challenge.bonus = { diamonds: d };
    } else { records = Math.round(records * 0.5); fans = Math.round(fans * 0.5); }
    p.daily.challengeBest = Math.max(p.daily.challengeBest || 0, result.cleared);
  }
  out.diamonds += result.gems || 0;
  if (result.rewardMul) { records = Math.round(records * (result.rewardMul.records || 1)); fans = Math.round(fans * (result.rewardMul.fans || 1)); }   // easy pays less, hard pays more
  p.records += records; out.records = records;
  p.diamonds += out.diamonds;
  out.fans = fans;
  out.levelUps = addFans(p, fans, rng);
  // loot: wins always drop one garage item, good losses sometimes
  const dropChance = result.won ? 1 : result.cleared >= 10 ? 0.4 : result.cleared >= 5 ? 0.15 : 0;
  if (dropChance && rng.chance(dropChance)) out.loot.push(rollGearItem(p, 'garage', rng));
  if (result.won && result.stars === 3) out.loot.push(rollGearItem(p, 'garage', rng, { min: 'rare' }));
  p.lastSeen = now || p.lastSeen;
  return out;
}

// ------------------------------------------------------------------------------------------------ boosters, wheel
export function boosterTotal(p) { return BOOSTER_IDS.filter((id) => p.boosters && p.boosters[id]).reduce((a, id) => a + BOOSTERS[id].price, 0); }
export function toggleBooster(p, id) { p.boosters = p.boosters || {}; p.boosters[id] = !p.boosters[id]; return p.boosters[id]; }
// pay for and consume the selected boosters. Returns { ok, fx, hype } or { ok:false } when diamonds are short.
export function useBoosters(p) {
  const total = boosterTotal(p);
  if (total > p.diamonds) return { ok: false, total };
  const fx = []; let hype = false;
  for (const id of BOOSTER_IDS) if (p.boosters && p.boosters[id]) { fx.push(...BOOSTERS[id].fx); if (BOOSTERS[id].special === 'hype') hype = true; }
  p.diamonds -= total; p.boosters = {};
  return { ok: true, fx, hype, total };
}
export function wheelState(p, now) {
  const day = dayOf(now);
  const free = !p.wheel || p.wheel.day !== day;
  return { free, price: WHEEL_SPIN_PRICE };
}
export function spinWheel(p, now, rng) {
  const st = wheelState(p, now);
  if (!st.free) { if (p.diamonds < WHEEL_SPIN_PRICE) return { ok: false, reason: 'diamonds' }; p.diamonds -= WHEEL_SPIN_PRICE; }
  p.wheel = { day: dayOf(now) };
  const seg = rng.weighted(WHEEL, (w) => w.weight);
  const index = WHEEL.indexOf(seg);
  const g = grant(p, seg.reward, rng);
  p.stats.spins = (p.stats.spins || 0) + 1;
  return { ok: true, index, seg, loot: g.loot };
}

export function markSeen(p, kind, id) { if (!p.seen[kind][id]) { p.seen[kind][id] = true; return true; } return false; }
