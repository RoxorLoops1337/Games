// Drop the Bass: translation overlays for the game data tables (names, blurbs, perks, descriptions, cutscene lines, tips ...).
// The data modules keep their English text in code. A translation is an overlay: js/lang/<code>_data.js default-exports
// { 'TURRETS.kick.name': 'Kick Kanon', ... } (path -> string). applyDataLang(code) writes the strings INTO the live data objects
// in place (same object identity, so every module that holds a reference sees the translation). English is captured on the first
// call, so going back to 'en' (or to a language with a partial overlay) restores the English text per field.
//
// Paths are `TABLE.<key>.<key>...field`. Arrays of objects with unique string ids are keyed by id (TURRET_BRANCHES.kick.kick_big_bang.name),
// everything else by index (CUTSCENES.intro.panels.0.lines.2.text = panel 0, line 2). See I18N_DATA.md for the full list.
import * as CORE from './data_core.js';
import * as RUN from './data_run.js';
import * as META from './data_meta.js';
import * as STORY from './data_story.js';
import * as DEPTH from './data_depth.js';
import * as HX from './data_hints_extra.js';
import * as CL from './data_changelog.js';
import { getLang, onLang, getData } from './i18n.js';

export const DATA_LANGS = ['da', 'nl', 'de'];   // languages that have (or may get) a js/lang/<code>_data.js

// ------------------------------------------------------------------ registry: which fields are translatable
// name = the export name (and the path prefix). patterns: '*' = every key / array item, last segment must be a string field.
// A pattern that matches a string without any letter (a number such as the wheel label '100') is skipped.
const T = (name, get, ...patterns) => ({ name, get, patterns });
export const TABLES = [
  T('GAME', () => CORE.GAME, 'subtitle', 'tagline'),
  T('RARITY', () => CORE.RARITY, '*.name'),
  T('TURRETS', () => CORE.TURRETS, '*.name', '*.blurb', '*.perks.*'),
  T('SYNERGIES', () => CORE.SYNERGIES, '*.name', '*.desc'),
  T('ENEMIES', () => CORE.ENEMIES, '*.name', '*.blurb'),
  T('BOSSES', () => CORE.BOSSES, '*.name', '*.trick'),
  T('AFFIXES', () => CORE.AFFIXES, '*.name'),
  T('WORLDS', () => CORE.WORLDS, '*.name', '*.place', '*.blurb'),
  T('DIFFICULTY', () => CORE.DIFFICULTY, '*.name', '*.desc'),
  T('STUDIO', () => META.STUDIO, '*.name', '*.desc'),
  T('SLOT_NAMES', () => META.SLOT_NAMES, '*'),
  T('STATS', () => META.STATS, '*.label'),
  T('SETS', () => META.SETS, '*.name', '*.bonus.*.text'),
  T('GEAR', () => META.GEAR, '*.name'),
  T('CRATES', () => META.CRATES, '*.name', '*.blurb'),
  T('OUTFITS', () => META.OUTFITS, '*.*.name', '*.*.desc'),
  T('QUESTS', () => META.QUESTS, '*.text'),
  T('ACHIEVEMENTS', () => META.ACHIEVEMENTS, '*.name', '*.text'),
  T('BOOSTERS', () => META.BOOSTERS, '*.name', '*.desc'),
  T('WHEEL', () => META.WHEEL, '*.label'),
  T('WEEKLY_GIGS', () => META.WEEKLY_GIGS, '*.name'),
  T('SKIN_FALLBACK', () => META.SKIN_FALLBACK, '*.name', '*.desc'),
  T('REMIX', () => RUN.REMIX, '*.name', '*.desc'),
  T('RELICS', () => RUN.RELICS, '*.name', '*.desc'),
  T('WAVE_MODS', () => RUN.WAVE_MODS, '*.name', '*.desc'),
  T('DAILY_MODS', () => RUN.DAILY_MODS, '*.name', '*.desc'),
  T('TURRET_BRANCHES', () => DEPTH.TURRET_BRANCHES, '*.*.name', '*.*.desc'),
  T('HERO_ABILITIES', () => DEPTH.HERO_ABILITIES, '*.*.name', '*.*.desc'),
  T('RUN_MODIFIERS', () => DEPTH.RUN_MODIFIERS, '*.name', '*.desc'),
  T('BOSS_PHASE_EFFECTS', () => DEPTH.BOSS_PHASE_EFFECTS, '*.name', '*.desc'),
  T('BOSS_PHASES', () => DEPTH.BOSS_PHASES, '*.*.text'),
  T('ENDLESS_MILESTONES', () => DEPTH.ENDLESS_MILESTONES, '*.name'),
  T('CUTSCENES', () => STORY.CUTSCENES, '*.panels.*.lines.*.text'),
  T('TUTORIAL', () => STORY.TUTORIAL, '*.say'),
  T('HINTS', () => STORY.HINTS, '*.title', '*.text'),
  T('HINTS_EXTRA', () => HX.HINTS_EXTRA, '*.title', '*.text'),   // path prefix HINTS: the same ids as HINTS (see ALIAS)
  T('LOOPY_TIPS', () => STORY.LOOPY_TIPS, '*'),
  T('CHANGELOG', () => CL.CHANGELOG, '*.title', '*.items.*'),
];
// tables whose path prefix is another table's (merged in at import time: the same object, or a copy of the same strings)
const ALIAS = { HINTS_EXTRA: 'HINTS' };
// BOARD_SKINS lives in doodle_env.js (art module). Loaded lazily so this module stays light for headless tests.
let BOARD_SKINS = null;
try { BOARD_SKINS = (await import('./doodle_env.js')).BOARD_SKINS || null; } catch (e) { /* art not available (headless) */ }
if (BOARD_SKINS) TABLES.push(T('BOARD_SKINS', () => BOARD_SKINS, '*.name', '*.desc'));

// FAME_TITLES is a list of [level, title] tuples: the path is FAME_TITLES.<level>
function fameSlots(out) {
  for (const row of META.FAME_TITLES) out.push({ path: 'FAME_TITLES.' + row[0], targets: [{ container: row, key: 1 }] });
}

// ------------------------------------------------------------------ non-text whitelist (used by the coverage audit)
// Every string leaf of an exported data table must be either a registered text slot or one of these. A new text field that is in
// neither fails tests/drop_the_bass_i18n_data.test.mjs. Strings holding no letter, colours (#fff, rgba()) are always non-text.
export const NON_TEXT_FIELDS = new Set([
  'id', 'hero', 'kind', 'color', 'accent', 'ground', 'sky', 'glyph', 'rarity', 'stat', 'slot', 'set', 'main', 'sub', 'turret', 'map',
  'mod', 'world', 'boss', 'boss10', 'pool', 'loadout', 'fx', 'mods', 'extra', 'music', 'who', 'scene', 'wait', 'spot', 'lock', 'special',
  'a', 'b', 'partner', 'reward', 'crate', 'cosmetic', 'fmt', 'guarantee', 'price', 'mul', 'wm', 'odds', 'unlock', 'paths', 'blocked',
  'saveKey', 'title_id', 'defaults',
]);
// exact `Export.field` exceptions where the field name is text elsewhere (HINTS.title) but not here
export const NON_TEXT_EXACT = new Set(['GAME.title']);
// exported values that hold only ids / numbers / derived copies: never audited for text
export const EXCLUDED_EXPORTS = new Set([
  'TURRET_IDS', 'STARTER_TURRETS', 'ENEMY_IDS', 'BOSS_IDS', 'STUDIO_IDS', 'GEAR_IDS', 'CRATE_IDS', 'REMIX_IDS', 'RELIC_IDS', 'WAVE_MOD_IDS',
  'DAILY_MOD_IDS', 'SKIN_IDS', 'BOOSTER_IDS', 'DIFFICULTY_IDS', 'RARITY_ORDER', 'WORLD_ORDER', 'BOSS_PHASE_EFFECT_IDS', 'NEW_SCENE_IDS',
  'SYN_FLAT', 'BRANCH_FX_KEYS', 'SLOTS', 'SKIN_DEFAULT', 'CREDITS_FINAL', 'EPILOGUES', 'HERO_ABILITY_DEFAULT', 'COL', 'MAPS',
  // copies or indexes of registered tables (checked by the test: same objects, or synced by afterApply)
  'SYNERGY_BY_ID', 'WORLD_BY_ID', 'BRANCH_BY_ID', 'BRANCH_TURRET', 'RUN_MODIFIER_BY_ID', 'TURRET_PARTNERS',
]);

// ------------------------------------------------------------------ slot expansion
const hasLetter = (s) => /\p{L}/u.test(s);
function labelsOf(node) {
  if (Array.isArray(node)) {
    const ok = node.length > 0 && node.every((x) => x && typeof x === 'object' && typeof x.id === 'string') && new Set(node.map((x) => x.id)).size === node.length;
    return node.map((x, i) => [i, ok ? x.id : String(i)]);
  }
  return Object.keys(node).map((k) => [k, k]);
}
function walk(node, segs, i, labels, out) {
  const seg = segs[i], last = i === segs.length - 1;
  const entries = seg === '*' ? labelsOf(node) : (seg in node ? [[seg, seg]] : []);
  for (const [k, label] of entries) {
    const v = node[k];
    if (last) { if (typeof v === 'string' && hasLetter(v)) out.push({ path: [...labels, label].join('.'), container: node, key: k }); }
    else if (v && typeof v === 'object') walk(v, segs, i + 1, [...labels, label], out);
  }
}
let SLOTS_CACHE = null;
// slots: [{ path, targets: [{ container, key, en }] }]; en = the English text captured on the first call.
export function getSlots() {
  if (SLOTS_CACHE) return SLOTS_CACHE;
  const byPath = new Map();
  const add = (path, container, key) => {
    let s = byPath.get(path);
    if (!s) { s = { path, targets: [] }; byPath.set(path, s); }
    if (!s.targets.some((t) => t.container === container && t.key === key)) s.targets.push({ container, key, en: container[key] });
  };
  for (const tb of TABLES) {
    let root; try { root = tb.get(); } catch (e) { root = null; }
    if (!root || typeof root !== 'object') continue;
    const prefix = ALIAS[tb.name] || tb.name;
    for (const p of tb.patterns) {
      const out = [];
      walk({ [prefix]: root }, [prefix, ...p.split('.')], 0, [], out);
      for (const s of out) add(s.path, s.container, s.key);
    }
  }
  const fame = []; fameSlots(fame);
  for (const s of fame) add(s.path, s.targets[0].container, s.targets[0].key);
  SLOTS_CACHE = [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
  return SLOTS_CACHE;
}
// English text per path, read from the ORIGINAL captured strings (safe to call after a language was applied)
export function englishMap() {
  const m = {};
  for (const s of getSlots()) m[s.path] = s.targets[0].en;
  return m;
}
// every (container, key) pair that is a registered text slot, for the coverage audit
export function coveredPairs() {
  const m = new Map();   // container -> Set(key)
  for (const s of getSlots()) for (const t of s.targets) { if (!m.has(t.container)) m.set(t.container, new Set()); m.get(t.container).add(String(t.key)); }
  return m;
}

// ------------------------------------------------------------------ derived copies
// TURRET_PARTNERS holds copies of the synergy names and descriptions made at import time: keep them in step.
function afterApply() {
  try {
    for (const list of Object.values(CORE.TURRET_PARTNERS)) for (const p of list) { const s = CORE.SYNERGY_BY_ID[p.id]; if (s) { p.name = s.name; p.desc = s.desc; } }
  } catch (e) { /* ignore */ }
}

// ------------------------------------------------------------------ dictionaries and apply
// i18n.js imports js/lang/<code>_data.js itself (loadLang) and keeps it in getData(code); it notifies onLang once the files arrived.
// setDataDict(code, dict) is an override that wins over it (tests, tools).
const overrides = {};
let current = 'en';
export function setDataDict(code, dict) { if (dict == null) delete overrides[code]; else overrides[code] = dict; }
export const getDataDict = (code) => overrides[code] || getData(code) || null;
// Apply a language to the live data (synchronous). `dict` overrides the loaded dictionary (tests). Fields without a usable translation
// show their English original. Returns the number of fields now showing a translation (0 for English).
export function applyDataLang(code, dict) {
  const slots = getSlots();
  const d = code === 'en' ? null : (dict || getDataDict(code));
  let n = 0;
  for (const s of slots) {
    const tr = d && typeof d[s.path] === 'string' && d[s.path] !== '' ? d[s.path] : null;
    for (const t of s.targets) t.container[t.key] = tr != null ? tr : t.en;
    if (tr != null) n++;
  }
  afterApply();
  current = code;
  return n;
}
export const currentDataLang = () => current;
let wired = false;
// Call once at boot, BEFORE initLang/setLang and before the UI subscribes to onLang (so a re-render already sees the new text):
// captures the English originals, applies the current language and re-applies on every language change.
export function initDataLang() {
  getSlots();
  applyDataLang(getLang());
  if (!wired) { wired = true; onLang((code) => { applyDataLang(code); }); }
}
