// Midnight Mog: the rooftop town. Pure data plus pure helper functions (no DOM, no Date, no Math.random).
// Owner: town and meta designer. The town sim (sim/town.js) implements exactly what docs/SYSTEMS.md
// section "Town and Meta" says; every number below is meant to be read from here, never copied.
//
// Hooks to economy.js (this file cannot import sim code, so costs are injected):
//   upgrade cost of a building from level L to L+1  = upgradeCost(def, L, economy.cost)
//     = economy.cost('building_level', L) * def.costMult       (L < 80, the economy curve)
//     = economy.cost('building_level', 79) * LATE_GROWTH^(L-79) * def.costMult   (L >= 80, endless)
//   first build (L 0 -> 1)                           = buildCost(def, economy.cost)
//   plot n-th purchase                               = plotUnlock(n, economy.cost)
// Output of the two classic producers mirrors economy.buildingOutput (0.45 fish / 0.06 yarn per
// second at level 1, level * 1.05^(level-1)), plus a x1.5 milestone every 25 levels.

// ------------------------------------------------------------------ constants

export const TIER_SPAN = 20;            // levels per building tier (tier = floor((level-1)/20)+1), forever
export const TOWN_WIDTH = 5;            // plot grid width
export const START_PLOTS = 4;           // plots owned on a fresh profile
export const LATE_GROWTH = 1.12;        // cost growth per level past economy's last level (79 -> 80+)
export const ECON_LAST_LEVEL = 80;      // economy.CURVES.building_level.maxLevel
export const ADJ = { posSoftAt: 1.0, posExp: 0.5, negFloor: -0.6 }; // adjacency potency limits
export const KEEP_DEFAULT = 0.5;        // fraction of building levels kept through a Nine Lives reset
export const TABLE_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 40, 50, 60, 80];

export const TIER_PREFIX = ['', 'Alley', 'Rooftop', 'Neon', 'Midnight', 'Mythic', 'Cosmic', 'Eternal'];

// Check-in loop (collect timers, caps, streak, visitors). All times are seconds; the caller passes now.
export const CHECKIN = {
  visitorSeconds: 4 * 3600,       // one visitor slot per 4 hours (clock_tower shortens it)
  visitorMinSeconds: 2 * 3600,
  fillBonusAt: 0.9,               // collecting a building that is >= 90% full pays x1.10 ("full bowl")
  fillBonus: 0.10,
  dailyTipMinutes: 20,            // first collect of a new day pays 20 minutes of town output extra
  streakCap: 0.35, streakHalf: 12, // streak bonus = 0.35 * d / (d + 12) on every collect
};

// Stat vocabulary. kind says where the town sim feeds the value.
//   prod: production stats (per second, gemsPerHour per hour). hardMax clamps after potency.
//   noPotency: integer step stats ignore adjacency.
export const STATS = {
  fishPerSec:         { unit: 'fish/s',  where: 'town production' },
  yarnPerSec:         { unit: 'yarn/s',  where: 'town production' },
  xpPerSec:           { unit: 'xp/s',    where: 'town production, spent as training xp (1 xp = 1 yarn on cat levels)' },
  gemsPerHour:        { unit: 'gems/h',  where: 'town production' },
  offlineCapHours:    { unit: 'hours',   where: 'added to economy.offlineCapSeconds, total clamped to 40h' },
  offlineEffAdd:      { unit: 'fraction', where: 'added to economy.offlineEfficiency, total clamped to 0.8' },
  buffPct:            { unit: 'fraction', where: 'battle: cat stat (strain) in the plot district; x0.3 elsewhere' },
  keysPerDay:         { unit: 'keys/day', where: 'town.keys production (crate id from keyCrate(level))' },
  pityCredit:         { unit: 'pulls',   where: 'loot: added to the pity counter when odds are computed' },
  deckSlots:          { unit: 'slots',   where: 'deck size cap', noPotency: true },
  cardCostDiscount:   { unit: 'fraction', where: 'economy.cost card_level multiplier (1 - x)' },
  mapsUnlocked:       { unit: 'maps',    where: 'observatory maps available, see mapAt(n)', noPotency: true },
  mapRewardPct:       { unit: 'fraction', where: 'extra reward on observatory map battles' },
  shardPct:           { unit: 'fraction', where: 'multiplies Nine Lives shards earned (1 + x)' },
  echoAdd:            { unit: 'fraction', where: 'added to NINE_LIVES.echoFraction' },
  keepAdd:            { unit: 'fraction', where: 'added to KEEP_DEFAULT: building levels kept through Nine Lives' },
  energyRegenPct:     { unit: 'fraction', where: 'battle: energy regen multiplier (1 + x)' },
  startEnergyAdd:     { unit: 'energy',  where: 'battle: starting energy', noPotency: true },
  storageSecondsAdd:  { unit: 'seconds', where: 'added to economy.townStorageSeconds for every building' },
  streakGrace:        { unit: 'days',    where: 'missed days the check-in streak forgives', noPotency: true },
  battleFishPct:      { unit: 'fraction', where: 'battle fish reward multiplier (1 + x)' },
  battleYarnPct:      { unit: 'fraction', where: 'battle yarn reward multiplier (1 + x)' },
  lootLuckPct:        { unit: 'fraction', where: 'battle loot drop chance multiplier (1 + x)' },
  visitorIntervalCut: { unit: 'fraction', where: 'shortens CHECKIN.visitorSeconds by (1 - x), floor visitorMinSeconds' },
  townOutputPct:      { unit: 'fraction', where: 'multiplies every town production stat (1 + x)' },
  baseHpPct:          { unit: 'fraction', where: 'battle: base hp multiplier (1 + x)' },
  baseRegenPct:       { unit: 'fraction', where: 'battle: base regen, fraction of max hp per second' },
  catLevelDiscount:   { unit: 'fraction', where: 'economy.cost cat_level multiplier (1 - x), also pays with training xp' },
};

// ------------------------------------------------------------------ shapes

// stat spec kinds (v = value at level L >= 1, before potency):
//   prod : a * L * 1.05^(L-1) * mile^floor(L/25)         (idle production, mirrors economy)
//   pow  : a * L^p * mile^floor(L/25)
//   lin  : a + b*(L-1); above `cap` softened: cap * (v/cap)^exp
//   sat  : cap * L / (L + half)                          (bounded forever, half-max at L = half)
//   step : start + per * floor(L / every), at most `max`
function shape(s, L) {
  switch (s.kind) {
    case 'prod': return s.a * L * Math.pow(1.05, L - 1) * Math.pow(s.mile || 1.5, Math.floor(L / 25));
    case 'pow': return s.a * Math.pow(L, s.p) * Math.pow(s.mile || 1, Math.floor(L / 25));
    case 'lin': {
      let v = s.a + s.b * (L - 1);
      if (s.cap && v > s.cap) v = s.cap * Math.pow(v / s.cap, s.exp == null ? 0.5 : s.exp);
      return v;
    }
    case 'sat': return s.cap * L / (L + s.half);
    case 'step': return Math.min(s.max == null ? Infinity : s.max, (s.start || 0) + s.per * Math.floor(L / s.every));
    default: throw new Error('buildings.shape: unknown kind ' + s.kind);
  }
}

const P = (stat, a, extra = {}) => ({ stat, kind: 'prod', a, ...extra });

// -------------------------------------------------------------- the sixteen

// receives: adjacency rules, from the receiver's point of view.
//   src  : 'any' (a building) | 'empty' (unlocked plot, nothing built) | 'void' (no plot there, open sky)
//          | 'id:<buildingId>' | 'tag:<tag>'
//   mode : '4' | '8' | 'row' | 'col' | 'cross3' (see neighborOffsets)
//   add  : potency change per matching cell (negative = penalty), cap: max absolute total of this rule
//   complete/completeBonus: extra when EVERY cell of the mode matches (the Nine Cell Shrine ring)
const RAW = [
  {
    id: 'tuna_cannery', name: 'Tuna Cannery', glyph: 'fish', tags: ['food', 'noisy'], unlockStage: 1, limit: 4,
    blurb: 'Hot tins, cold fish. The backbone of every rooftop.',
    costMult: 1, buildMult: 1, keep: 0.5,
    effects: [P('fishPerSec', 0.45)],
    receives: [
      { name: 'Smoke and tin', src: 'id:smokehouse', mode: '4', add: 0.15, cap: 0.3 },
      { name: 'Fresh herbs', src: 'id:catnip_garden', mode: '4', add: 0.08, cap: 0.16 },
      { name: 'Cold storage', src: 'id:kitty_bank', mode: '4', add: 0.1, cap: 0.1 },
    ],
  },
  {
    id: 'yarn_mill', name: 'Yarn Mill', glyph: 'yarn', tags: ['craft', 'noisy'], unlockStage: 3, limit: 4,
    blurb: 'Spins stray threads into proper yarn.',
    costMult: 1.2, buildMult: 2, keep: 0.5,
    effects: [P('yarnPerSec', 0.06)],
    receives: [
      { name: 'Cozy corner', src: 'tag:cozy', mode: '4', add: 0.1, cap: 0.3 },
      { name: 'Craft guild', src: 'tag:craft', mode: '4', add: 0.08, cap: 0.16 },
      { name: 'Too loud to count stitches', src: 'tag:noisy', mode: '4', add: -0.05, cap: 0.15 },
    ],
  },
  {
    id: 'scratching_post', name: 'Scratching Post', glyph: 'post', tags: ['martial'], unlockStage: 5, limit: 2,
    blurb: 'Sharpens claws and trains xp while you sleep.',
    costMult: 1.5, buildMult: 4, keep: 0.5,
    effects: [P('xpPerSec', 0.04), { stat: 'catLevelDiscount', kind: 'sat', cap: 0.25, half: 40, hardMax: 0.4 }],
    receives: [
      { name: 'Sparring partners', src: 'tag:martial', mode: '4', add: 0.12, cap: 0.36 },
      { name: 'Catnip break', src: 'id:catnip_garden', mode: '4', add: 0.1, cap: 0.1 },
    ],
  },
  {
    id: 'crate_workshop', name: 'Crate Workshop', glyph: 'crate', tags: ['craft', 'noisy'], unlockStage: 8, limit: 1,
    blurb: 'Hammers together crate keys and rigs the pity luck.',
    costMult: 2, buildMult: 8, keep: 0.75,
    effects: [
      { stat: 'keysPerDay', kind: 'lin', a: 0.25, b: 0.06, cap: 4, exp: 0.5 },
      { stat: 'pityCredit', kind: 'lin', a: 0, b: 0.5, cap: 20, exp: 0.5, int: true, hardMax: 30 },
    ],
    receives: [
      { name: 'Raw materials', src: 'tag:craft', mode: '4', add: 0.1, cap: 0.3 },
      { name: 'Fish and keys', src: 'id:tuna_cannery', mode: '4', add: 0.1, cap: 0.1 },
      { name: 'Vault space', src: 'id:kitty_bank', mode: '4', add: 0.12, cap: 0.12 },
    ],
  },
  {
    id: 'nap_dome', name: 'Nap Dome', glyph: 'dome', tags: ['cozy'], unlockStage: 12, limit: 1,
    blurb: 'A glass bubble of perfect warmth. Cats sleep, you stay rich.',
    costMult: 2, buildMult: 10, keep: 1,
    effects: [
      { stat: 'offlineCapHours', kind: 'lin', a: 0.5, b: 0.5, cap: 16, exp: 0.5, hardMax: 24 },
      { stat: 'offlineEffAdd', kind: 'sat', cap: 0.2, half: 25, hardMax: 0.3 },
    ],
    receives: [
      { name: 'Quiet airspace', src: 'empty', mode: '4', add: 0.06, cap: 0.24 },
      { name: 'Warm neighbours', src: 'tag:cozy', mode: '4', add: 0.1, cap: 0.3 },
      { name: 'Noise complaint', src: 'tag:noisy', mode: '4', add: -0.12, cap: 0.36 },
    ],
  },
  {
    id: 'barracks', name: 'Barracks', glyph: 'barracks', tags: ['martial'], unlockStage: 10, limit: 1,
    blurb: 'Bunk beds for more cards in your deck.',
    costMult: 2.5, buildMult: 12, keep: 1,
    effects: [
      { stat: 'deckSlots', kind: 'step', per: 1, every: 8, start: 0, noPotency: true },
      { stat: 'cardCostDiscount', kind: 'sat', cap: 0.25, half: 40, hardMax: 0.4 },
    ],
    receives: [
      { name: 'Drill squad', src: 'tag:martial', mode: '4', add: 0.1, cap: 0.3 },
      { name: 'Parade ground', src: 'id:scratching_post', mode: 'row', add: 0.08, cap: 0.16 },
      { name: 'Reveille ban', src: 'id:nap_dome', mode: '4', add: -0.05, cap: 0.05 },
    ],
  },
  {
    id: 'laser_arcade', name: 'Laser Pointer Arcade', glyph: 'arcade', tags: ['noisy', 'neon'], unlockStage: 14, limit: 1,
    blurb: 'Chase the red dot. Energy flows faster after.',
    costMult: 2, buildMult: 10, keep: 0.75,
    effects: [
      { stat: 'energyRegenPct', kind: 'sat', cap: 0.3, half: 30, hardMax: 0.45 },
      { stat: 'startEnergyAdd', kind: 'step', per: 1, every: 15, start: 0, max: 3, noPotency: true },
    ],
    receives: [
      { name: 'Neon crowd', src: 'tag:noisy', mode: '4', add: 0.08, cap: 0.24 },
      { name: 'Prize counter', src: 'id:crate_workshop', mode: '4', add: 0.1, cap: 0.1 },
    ],
  },
  {
    id: 'smokehouse', name: 'Sardine Smokehouse', glyph: 'smoke', tags: ['food'], unlockStage: 15, limit: 2,
    blurb: 'Smoked sardines make every fish stronger, near and far.',
    costMult: 1.5, buildMult: 5, keep: 0.5,
    effects: [P('fishPerSec', 0.2), { stat: 'battleFishPct', kind: 'sat', cap: 0.35, half: 30, hardMax: 0.5 }],
    receives: [
      { name: 'Fresh catch', src: 'id:tuna_cannery', mode: '4', add: 0.1, cap: 0.2 },
      { name: 'Vents', src: 'empty', mode: '4', add: 0.05, cap: 0.15 },
    ],
  },
  {
    id: 'kitty_bank', name: 'Kitty Bank', glyph: 'bank', tags: ['money'], unlockStage: 18, limit: 1,
    blurb: 'A pink vault. Deeper bins mean you can stay away longer.',
    costMult: 3, buildMult: 20, keep: 1,
    effects: [
      { stat: 'storageSecondsAdd', kind: 'lin', a: 900, b: 900, cap: 43200, exp: 0.5, hardMax: 86400 },
      { stat: 'streakGrace', kind: 'step', per: 1, every: 20, start: 0, max: 3, noPotency: true },
    ],
    receives: [
      { name: 'Money row', src: 'tag:money', mode: '4', add: 0.12, cap: 0.24 },
      { name: 'Deposits', src: 'tag:food', mode: '4', add: 0.06, cap: 0.18 },
      { name: 'Security hum', src: 'tag:noisy', mode: '4', add: -0.05, cap: 0.1 },
    ],
  },
  {
    id: 'vet_clinic', name: 'Vet Clinic', glyph: 'clinic', tags: ['martial', 'cozy'], unlockStage: 20, limit: 1,
    blurb: 'Purr therapy for the rooftop base.',
    costMult: 2.5, buildMult: 20, keep: 0.75,
    effects: [
      { stat: 'baseHpPct', kind: 'sat', cap: 0.5, half: 30, hardMax: 0.8 },
      { stat: 'baseRegenPct', kind: 'lin', a: 0.0005, b: 0.00015, cap: 0.01, exp: 0.5, hardMax: 0.02 },
    ],
    receives: [
      { name: 'Warm bandages', src: 'tag:cozy', mode: '4', add: 0.1, cap: 0.2 },
      { name: 'Field medics', src: 'tag:martial', mode: '4', add: 0.1, cap: 0.2 },
      { name: 'Clatter', src: 'tag:noisy', mode: '4', add: -0.08, cap: 0.24 },
    ],
  },
  {
    id: 'gem_mine', name: 'Gem Mine', glyph: 'pick', tags: ['money', 'noisy', 'sewer'], unlockStage: 21, limit: 2,
    buildExtra: { gems: 25 },
    blurb: 'Dug into the sewers. Slow, but it makes real gems.',
    costMult: 2.5, buildMult: 16, keep: 0.5, storage: 1.5,
    effects: [{ stat: 'gemsPerHour', kind: 'pow', a: 0.12, p: 0.9, mile: 1.25 }],
    receives: [
      { name: 'Ore cart', src: 'tag:money', mode: '4', add: 0.12, cap: 0.24 },
      { name: 'Ventilation', src: 'empty', mode: '4', add: 0.05, cap: 0.2 },
      { name: 'Second shaft', src: 'id:gem_mine', mode: 'row', add: 0.1, cap: 0.1 },
    ],
  },
  {
    id: 'catnip_garden', name: 'Catnip Garden', glyph: 'leaf', tags: ['cozy', 'food'], unlockStage: 25, limit: 3,
    blurb: 'Pick a district and a strain. Cats fighting there get a buzz.',
    costMult: 2, buildMult: 12, keep: 0.75,
    choices: { district: true, strain: ['dmg', 'rate', 'hp'] },
    effects: [{ stat: 'buffPct', kind: 'sat', cap: 0.3, half: 30, hardMax: 0.6 }],
    receives: [
      { name: 'Full sun', src: 'void', mode: '4', add: 0.08, cap: 0.32 },
      { name: 'Quiet beds', src: 'id:nap_dome', mode: '4', add: 0.1, cap: 0.1 },
      { name: 'Smog', src: 'tag:noisy', mode: '4', add: -0.08, cap: 0.24 },
    ],
  },
  {
    id: 'clock_tower', name: 'Clock Tower', glyph: 'clock', tags: ['arcane'], unlockStage: 30, limit: 1,
    blurb: 'Bends the hours: visitors arrive sooner and the whole town hums.',
    costMult: 4, buildMult: 40, keep: 1,
    effects: [
      { stat: 'visitorIntervalCut', kind: 'sat', cap: 0.5, half: 30, hardMax: 0.5 },
      { stat: 'townOutputPct', kind: 'sat', cap: 0.25, half: 40, hardMax: 0.5 },
    ],
    receives: [
      { name: 'In sight of the dial', src: 'any', mode: 'cross3', add: 0.04, cap: 0.24 },
      { name: 'Arcane resonance', src: 'tag:arcane', mode: '4', add: 0.1, cap: 0.2 },
    ],
  },
  {
    id: 'shrine_nine_lives', name: 'Shrine to the Nine Lives', glyph: 'shrine', tags: ['arcane'], unlockStage: 30, limit: 1,
    buildExtra: { gems: 100 },
    blurb: 'Eight neighbours and one cat: the Nine Cell Shrine ring pays double.',
    costMult: 5, buildMult: 80, keep: 1,
    effects: [
      { stat: 'shardPct', kind: 'lin', a: 0.02, b: 0.02, cap: 1.0, exp: 0.5, hardMax: 2.5 },
      { stat: 'echoAdd', kind: 'sat', cap: 0.2, half: 30, hardMax: 0.3 },
      { stat: 'keepAdd', kind: 'sat', cap: 0.5, half: 40, hardMax: 0.5 },
    ],
    receives: [
      { name: 'Nine Cell ring', src: 'any', mode: '8', add: 0.04, cap: 0.32, complete: true, completeBonus: 0.28 },
      { name: 'Arcane choir', src: 'tag:arcane', mode: '4', add: 0.1, cap: 0.2 },
      { name: 'Distracting racket', src: 'tag:noisy', mode: '4', add: -0.08, cap: 0.24 },
    ],
  },
  {
    id: 'radio_tower', name: 'Cat Radio Tower', glyph: 'radio', tags: ['noisy', 'neon'], unlockStage: 40, limit: 1,
    blurb: 'Broadcasts the hunt: yarn tips and lucky drops roll in.',
    costMult: 3, buildMult: 30, keep: 0.75,
    effects: [
      { stat: 'battleYarnPct', kind: 'sat', cap: 0.35, half: 30, hardMax: 0.5 },
      { stat: 'lootLuckPct', kind: 'sat', cap: 0.15, half: 40, hardMax: 0.25 },
    ],
    receives: [
      { name: 'Open airwaves', src: 'void', mode: '4', add: 0.1, cap: 0.3 },
      { name: 'Broadcast reach', src: 'any', mode: 'cross3', add: 0.03, cap: 0.18 },
    ],
  },
  {
    id: 'observatory', name: 'Observatory', glyph: 'scope', tags: ['arcane'], unlockStage: 35, limit: 1,
    buildExtra: { gems: 50 },
    blurb: 'Charts bonus maps among the stars. Wants an open sky.',
    costMult: 4, buildMult: 60, keep: 1,
    effects: [
      { stat: 'mapsUnlocked', kind: 'step', per: 1, every: 6, start: 1, noPotency: true },
      { stat: 'mapRewardPct', kind: 'lin', a: 0.02, b: 0.02, cap: 1.0, exp: 0.5, hardMax: 2 },
    ],
    receives: [
      { name: 'Open sky', src: 'void', mode: '4', add: 0.12, cap: 0.36 },
      { name: 'Light pollution', src: 'tag:neon', mode: '4', add: -0.15, cap: 0.3 },
      { name: 'Kindred stargazers', src: 'tag:arcane', mode: '4', add: 0.08, cap: 0.16 },
    ],
  },
];

// ------------------------------------------------------------------ helpers

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  let x = Math.max(1, Math.floor(n)), s = '';
  for (const [v, r] of ROMAN) while (x >= v) { s += r; x -= v; }
  return s;
}

export function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
const fin = (x) => (Number.isFinite(x) ? x : 0);

/** Tier of a building at `level` (1 based, endless). */
export function tierOf(level) { return 1 + Math.floor((Math.max(1, Math.floor(level)) - 1) / TIER_SPAN); }

/** Display name with the endless tier prefix: "Tuna Cannery", "Alley Tuna Cannery", ... "Eternal II Tuna Cannery". */
export function tierName(def, level) {
  const t = tierOf(level);
  if (t <= 1) return def.name;
  const pre = t - 1 < TIER_PREFIX.length ? TIER_PREFIX[t - 1] : 'Eternal ' + roman(t - TIER_PREFIX.length + 1);
  return pre + ' ' + def.name;
}

/** Raw value of one stat spec at a level with adjacency potency (1 = none). */
export function statValue(spec, level, potency = 1) {
  const L = Math.floor(level);
  if (!(L >= 1)) return 0;
  const spc = STATS[spec.stat] || {};
  let v = fin(shape(spec, L));
  if (!(spec.noPotency || spc.noPotency)) v *= potency;
  if (spec.hardMax != null && v > spec.hardMax) v = spec.hardMax;
  return spec.int ? Math.floor(v + 1e-9) : v;
}

/** {stat: value} for a building definition at a level. */
export function statsAt(def, level, potency = 1) {
  const out = {};
  for (const e of def.effects) out[e.stat] = statValue(e, level, potency);
  return out;
}

/** Per second output of a producing building: {fish, yarn, xp, gems} (gems are converted from per hour). */
export function outputPerSecond(def, level, potency = 1) {
  const out = { fish: 0, yarn: 0, xp: 0, gems: 0 };
  for (const e of def.effects) {
    const v = statValue(e, level, potency);
    if (e.stat === 'fishPerSec') out.fish += v;
    else if (e.stat === 'yarnPerSec') out.yarn += v;
    else if (e.stat === 'xpPerSec') out.xp += v;
    else if (e.stat === 'gemsPerHour') out.gems += v / 3600;
  }
  return out;
}

/** Which crate a Crate Workshop key opens at this level. */
export function keyCrate(level) { return level < 12 ? 'alley_crate' : level < 30 ? 'neon_crate' : 'rooftop_crate'; }

/** Cost to go from `level` to level + 1 (level 0 is a first build, use buildCost for that). costFn = economy.cost. */
export function upgradeCost(def, level, costFn) {
  const L = Math.max(1, Math.floor(level));
  const base = L < ECON_LAST_LEVEL ? costFn('building_level', L) : costFn('building_level', ECON_LAST_LEVEL - 1) * Math.pow(LATE_GROWTH, L - (ECON_LAST_LEVEL - 1));
  return Math.min(1e15, Math.ceil(base * def.costMult));
}

/** Fish cost of the first build plus one-time extras: {fish, gems}. */
export function buildCost(def, costFn) {
  return { fish: Math.ceil(costFn('building_level', 0) * def.buildMult), gems: (def.buildExtra && def.buildExtra.gems) || 0 };
}

// ------------------------------------------------------------------ grid

// Plot order: a spiral-ish growth from the middle of a 5 wide grid so early plots touch each other
// (the first four plots form a plus shape around the centre). After the first 25 plots, rows of 5 are
// appended below forever.
function buildOrder() {
  const cells = [];
  for (let y = 0; y < TOWN_WIDTH; y++) for (let x = 0; x < TOWN_WIDTH; x++) cells.push({ x, y });
  const c = (TOWN_WIDTH - 1) / 2;
  const dist = (p) => Math.abs(p.x - c) + Math.abs(p.y - c);
  const cheb = (p) => Math.max(Math.abs(p.x - c), Math.abs(p.y - c));
  // tie break: right, down, left, up of the centre, then row-major
  cells.sort((a, b) => dist(a) - dist(b) || cheb(a) - cheb(b) || a.y - b.y || a.x - b.x);
  return cells;
}
const ORDER = buildOrder();

/** Grid coordinate {x, y} of plot index i (0 based), for any i. */
export function plotCoord(i) {
  const n = Math.max(0, Math.floor(i));
  if (n < ORDER.length) return ORDER[n];
  const k = n - ORDER.length;
  return { x: k % TOWN_WIDTH, y: TOWN_WIDTH + Math.floor(k / TOWN_WIDTH) };
}

const gridCache = new Map();
/** {count, coords[], at(x,y) -> index or -1} for a town that owns `count` plots. */
export function makeGrid(count) {
  const n = Math.max(0, Math.floor(count));
  let g = gridCache.get(n);
  if (g) return g;
  const coords = [], byKey = new Map();
  for (let i = 0; i < n; i++) { const p = plotCoord(i); coords.push(p); byKey.set(p.x + ',' + p.y, i); }
  g = { count: n, coords, at: (x, y) => (byKey.has(x + ',' + y) ? byKey.get(x + ',' + y) : -1) };
  if (gridCache.size > 64) gridCache.clear();
  gridCache.set(n, g);
  return g;
}

const OFF4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const OFF8 = [...OFF4, [1, -1], [1, 1], [-1, 1], [-1, -1]];
const OFFROW = [-4, -3, -2, -1, 1, 2, 3, 4].map((d) => [d, 0]);
const OFFCOL = [-4, -3, -2, -1, 1, 2, 3, 4].map((d) => [0, d]);
const OFFX3 = [-3, -2, -1, 1, 2, 3].flatMap((d) => [[d, 0], [0, d]]);
export const MODES = { 4: OFF4, 8: OFF8, row: OFFROW, col: OFFCOL, cross3: OFFX3 };
export function neighborOffsets(mode) { return MODES[mode]; }

/**
 * Adjacency potency of the building on plot `index`.
 *   plots : array of {b, level, ...} or {} / null for empty, length = plots owned
 * Returns {potency, bonus, parts:[{name, count, value}]}. potency = 1 + positive (softened) + negative.
 */
export function adjacency(plots, index) {
  const p = plots[index];
  const def = p && p.b ? BUILDING_BY_ID[p.b] : null;
  if (!def) return { potency: 1, bonus: 0, parts: [] };
  const grid = makeGrid(plots.length);
  const me = grid.coords[index];
  let pos = 0, neg = 0;
  const parts = [];
  for (const r of def.receives) {
    const offs = MODES[r.mode];
    let count = 0;
    for (const [dx, dy] of offs) {
      const j = grid.at(me.x + dx, me.y + dy);
      if (matchSrc(r.src, j < 0 ? null : plots[j], j < 0)) count++;
    }
    let v = r.add * count;
    const cap = r.cap == null ? Infinity : r.cap;
    if (Math.abs(v) > cap) v = Math.sign(v) * cap;
    if (r.complete && count === offs.length) v += r.completeBonus || 0;
    if (count > 0) parts.push({ name: r.name, count, value: v });
    if (v >= 0) pos += v; else neg += v;
  }
  if (pos > ADJ.posSoftAt) pos = ADJ.posSoftAt * Math.pow(pos / ADJ.posSoftAt, ADJ.posExp);
  const bonus = pos + Math.max(ADJ.negFloor, neg);
  return { potency: 1 + bonus, bonus, parts };
}

function matchSrc(src, plot, isVoid) {
  if (src === 'void') return isVoid;
  if (isVoid) return false;
  const has = plot && plot.b;
  if (src === 'empty') return !has;
  if (!has) return false;
  if (src === 'any') return true;
  if (src.startsWith('id:')) return plot.b === src.slice(3);
  if (src.startsWith('tag:')) { const d = BUILDING_BY_ID[plot.b]; return !!d && d.tags.includes(src.slice(4)); }
  return false;
}

// ------------------------------------------------------------- plot ladder

/** Fish cost of the n-th plot purchase (n = 0 buys plot number START_PLOTS + 1). costFn = economy.cost. */
export function plotUnlock(n, costFn) {
  const k = Math.max(0, Math.floor(n));
  const SLOTS = 12; // economy.CURVES.unlock_slot.maxLevel
  const fish = k < SLOTS ? costFn('unlock_slot', k) : Math.min(1e15, Math.ceil(costFn('unlock_slot', SLOTS - 1) * Math.pow(2.6, k - SLOTS + 1)));
  return { fish, needStage: 3 + 5 * k, plotIndex: START_PLOTS + k };
}

// -------------------------------------------------- tables, prestige, maps

/** Effect table rows for a definition: [{level, tier, costMult, stats}] at TABLE_LEVELS. */
export function effectTable(def, levels = TABLE_LEVELS) {
  return levels.map((level) => ({ level, tier: tierOf(level), costMult: def.costMult, stats: statsAt(def, level) }));
}

/** Level a building keeps through a Nine Lives reset. keepAdd comes from the shrine (0 when absent). */
export function keptLevel(def, level, keepAdd = 0) {
  const f = clamp((def.keep == null ? KEEP_DEFAULT : def.keep) + (def.keep >= 1 ? 0 : keepAdd), 0, 1);
  return Math.max(level > 0 ? 1 : 0, Math.floor(level * f));
}

const DISTRICT_IDS = ['rooftop_row', 'alley_alamo', 'sewer_sprawl', 'laser_lights', 'appliance_heights', 'bathtub_bay'];
const MAP_POOL = [
  { text: 'Full moon: cats crit 5% more.', effect: { kind: 'stat_mod', scope: 'all_cats', stat: 'crit', add: 0.05 } },
  { text: 'Thick fog: cats have 10% more hp.', effect: { kind: 'stat_mod', scope: 'all_cats', stat: 'hp', mult: 1.1 } },
  { text: 'Tailwind: cats attack 8% faster.', effect: { kind: 'stat_mod', scope: 'all_cats', stat: 'rate', mult: 1.08 } },
  { text: 'Static storm: enemies are 10% faster.', effect: { kind: 'stat_mod', scope: 'enemies', stat: 'speed', mult: 1.1 } },
  { text: 'Iron rain: enemies have 15% more hp.', effect: { kind: 'stat_mod', scope: 'enemies', stat: 'hp', mult: 1.15 } },
  { text: 'Starlight: spells hit 12% harder.', effect: { kind: 'stat_mod', scope: 'cards', stat: 'spell_power', mult: 1.12 } },
];
const MAP_NAMES = ['Moonlit Roof', 'Chimney Maze', 'Gutter Gardens', 'Satellite Dish Hill', 'Water Tower Plateau', 'Skylight Canyon'];

/**
 * Observatory map number n (0 based), forever. difficulty multiplies the player's best global stage to pick
 * the battle stage (stage = max(1, round(best * difficulty))). rewardMult multiplies the replay reward.
 */
export function mapAt(n) {
  const i = Math.max(0, Math.floor(n));
  const mod = MAP_POOL[(i * 5 + 1) % MAP_POOL.length];
  const named = i < MAP_NAMES.length;
  return {
    id: named ? 'map_' + MAP_NAMES[i].toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '') : 'comet_rift_' + (i - MAP_NAMES.length + 1),
    name: named ? MAP_NAMES[i] : 'Comet Rift ' + roman(i - MAP_NAMES.length + 1),
    index: i, needMaps: i + 1,
    baseDistrict: DISTRICT_IDS[i % DISTRICT_IDS.length],
    waves: Math.min(12, 4 + Math.floor(i / 2)),
    difficulty: Math.round((0.85 + 0.03 * i) * 100) / 100,
    rewardMult: Math.round((1.3 + 0.1 * i) * 100) / 100,
    modifier: mod,
  };
}

// ----------------------------------------------------- check-in loop helpers

/** Multiplier on a collected batch when the building was filled to `fill` (0..1) of its storage. */
export function fillMult(fill) { return fill >= CHECKIN.fillBonusAt ? 1 + CHECKIN.fillBonus : 1; }

/** Streak bonus fraction (0.35 * d / (d + 12)). */
export function streakBonus(days) { const d = Math.max(0, days | 0); return CHECKIN.streakCap * d / (d + CHECKIN.streakHalf); }

/**
 * Advance the streak on the first collect of a day. streak = {days, last}; dayIndex is passed by the caller.
 * `grace` missed days in a row are forgiven (kitty_bank streakGrace). Returns a new object.
 */
export function advanceStreak(streak, dayIndex, grace = 0) {
  const s = streak || { days: 0, last: -1 };
  if (s.last === dayIndex) return { days: s.days, last: s.last, fresh: false };
  const missed = s.last < 0 ? 0 : dayIndex - s.last - 1;
  if (dayIndex < s.last) return { days: s.days, last: s.last, fresh: false }; // clock went backwards: no change
  const days = s.last >= 0 && missed <= grace ? s.days + 1 : 1;
  return { days, last: dayIndex, fresh: true };
}

/** Seconds between visitors given the clock tower cut. */
export function visitorSeconds(cut = 0) { return Math.max(CHECKIN.visitorMinSeconds, Math.floor(CHECKIN.visitorSeconds * (1 - cut))); }

const VISITORS = [
  { id: 'stray_trader', name: 'Stray Trader', w: 40, reward: { fish: { minutes: 25 } } },
  { id: 'yarn_peddler', name: 'Yarn Peddler', w: 30, reward: { yarn: { minutes: 25 } } },
  { id: 'old_sage', name: 'Old Sage Cat', w: 10, need: 'scratching_post', reward: { xp: { minutes: 40 } } },
  { id: 'tinker', name: 'Travelling Tinker', w: 8, need: 'crate_workshop', reward: { keys: { alley_crate: 1 } } },
  { id: 'star_gazer', name: 'Star Gazer', w: 6, need: 'observatory', reward: { gems: 3 } },
  { id: 'golden_stray', name: 'Golden Stray', w: 3, reward: { fish: { minutes: 120 } } },
];
export const VISITOR_KINDS = VISITORS;

function hash32(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= 124; h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export { hash32 };

/** Deterministic visitor for a slot (slot = floor(nowSeconds / visitorSeconds)). built = array or Set of built ids. */
export function visitorForSlot(slot, seed, built = []) {
  const has = built instanceof Set ? built : new Set(built);
  const pool = VISITORS.filter((v) => !v.need || has.has(v.need));
  let r = (hash32('visitor', seed, slot) / 4294967296) * pool.reduce((s, v) => s + v.w, 0);
  for (const v of pool) { r -= v.w; if (r < 0) return v; }
  return pool[pool.length - 1];
}

/**
 * Resolve a reward spec to concrete numbers. perMinute = {fish, yarn, xp} town/active income per minute
 * (sim: economy.income(profile).active.fish * 60 ...). Spec: {fish:{minutes}, yarn:{minutes}, xp:{minutes}, gems, tokens, keys:{crateId:n}}.
 */
export function resolveReward(r, perMinute = {}) {
  const out = { fish: 0, yarn: 0, xp: 0, gems: 0, tokens: 0, keys: {} };
  if (!r) return out;
  for (const k of ['fish', 'yarn', 'xp']) if (r[k]) out[k] = Math.floor(fin((perMinute[k] || 0) * r[k].minutes));
  out.gems = Math.floor(r.gems || 0);
  out.tokens = Math.floor(r.tokens || 0);
  if (r.keys) for (const id of Object.keys(r.keys)) out.keys[id] = Math.floor(r.keys[id]);
  return out;
}

// --------------------------------------------------------------- exports

export const BUILDINGS = RAW.map((d) => ({ ...d, table: null }));
export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
for (const b of BUILDINGS) b.table = effectTable(b);
export const BUILDING_IDS = BUILDINGS.map((b) => b.id);
/** Buildings that produce a currency (the town sim collects these). economy.townOutput must only count these. */
export const PRODUCERS = BUILDINGS.filter((b) => b.effects.some((e) => ['fishPerSec', 'yarnPerSec', 'xpPerSec', 'gemsPerHour'].includes(e.stat))).map((b) => b.id);
export const TAGS = [...new Set(BUILDINGS.flatMap((b) => b.tags))];

/** Check a plot option (garden choices). Returns null when valid, else a message. */
export function validateOpt(def, opt) {
  if (!def.choices) return null;
  if (!opt) return 'needs options';
  if (def.choices.district && !DISTRICT_IDS.includes(opt.district)) return 'bad district';
  if (def.choices.strain && !def.choices.strain.includes(opt.strain)) return 'bad strain';
  return null;
}
export const DISTRICT_CHOICES = DISTRICT_IDS;

/** Data self check. Returns problems (empty is good). */
export function validateBuildings() {
  const bad = [];
  const ids = new Set();
  for (const b of BUILDINGS) {
    if (ids.has(b.id)) bad.push('dup id ' + b.id);
    ids.add(b.id);
    if (!/^[a-z][a-z0-9_]*$/.test(b.id)) bad.push('bad id ' + b.id);
    if (/yarn|mill|loom|knit|wool/.test(b.id) && b.id !== 'yarn_mill') bad.push(b.id + ' would be classed yarn by economy.buildingKind');
    for (const e of b.effects) {
      if (!STATS[e.stat]) bad.push(b.id + ' unknown stat ' + e.stat);
      let prev = -1;
      for (const row of b.table) {
        const v = row.stats[e.stat];
        if (!(v >= prev - 1e-12)) bad.push(b.id + '.' + e.stat + ' not monotonic at ' + row.level);
        prev = v;
      }
    }
    for (const r of b.receives) {
      if (!MODES[r.mode]) bad.push(b.id + ' bad mode ' + r.mode);
      if (r.src.startsWith('id:') && !ids.has(r.src.slice(3)) && !RAW.some((x) => x.id === r.src.slice(3))) bad.push(b.id + ' unknown src ' + r.src);
      if (r.src.startsWith('tag:') && !RAW.some((x) => x.tags.includes(r.src.slice(4)))) bad.push(b.id + ' unknown tag ' + r.src);
    }
  }
  if (BUILDINGS.length !== 16) bad.push('expected 16 buildings');
  return bad;
}
