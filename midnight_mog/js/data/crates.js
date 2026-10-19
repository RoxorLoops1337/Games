// Crates: five tiers, paid only with in-game fish, yarn or gems (money-free). Pure data.
// The odds printed in the game and the odds rolled by sim/loot.js come from THIS table, nothing else.
// Ids match economy.CRATE_PRICES (alley, neon, rooftop, midnight, mythic) so prices resolve there.
// Ids are append-only. Display names are free to change.
//
// weights : percent per rarity, each row sums to exactly 100.
// pity    : per target tier { soft, hard } or null when the crate cannot drop that tier (or has no pity for it).
//           Counter = pulls since the last drop of that tier or better. On pull number `hard` (counter hard-1)
//           the chance of that tier or better is 100%. From pull `soft` on, it ramps linearly from its base
//           chance to 100%.
// mix     : per rarity, the share of drops that are cats, cards, relics, yarn or gems. Gems only drop from
//           gem crates (a fish or yarn crate that paid gems would be a secret exchange rate).
// yarn / gems : the fixed amount a yarn or gem drop pays, per rarity.
// golden  : chance per pull of a Golden flash (a pure bonus, never changes the rarity): all values double.
// multi   : the x10 button. Costs ten sequential single prices. If none of the ten reached `guarantee`,
//           the last pull is rolled only among that rarity or better.
// reveal  : metadata for the opening animation (read by the UI, never used by the roll).
//           Colours are PAL role names (palette.js), rarity ids resolve through palette.RARITY.

export const RARITY_IDS = ['common', 'rare', 'epic', 'legend', 'mythic'];
export const PITY_TIERS = ['epic', 'legend', 'mythic'];
export const GOLDEN_CHANCE = 0.02;
export const MULTI_COUNT = 10;
// Each crate_luck meta level (economy.META) multiplies the weight of every non-common rarity by this
// much before the row is renormalised. It is printed in the odds table (luck.level, luck.mult).
export const LUCK_PER_LEVEL = 0.05;
// Dupes needed in total (cats[id].dupes) for star 1..8. Every duplicate also pays yarn.
export const STAR_DUPES = [1, 3, 6, 10, 16, 24, 34, 46];
export const MAX_STARS = STAR_DUPES.length;
// Share of DUPE_YARN paid when a card or relic you already own drops (cats pay in full, plus stars).
export const DUPE_SHARE = { cat: 1, card: 0.5, relic: 1 };

const mixRow = (cat, card, relic, yarn, gems) => ({ cat, card, relic, yarn, gems });

// Shared mixes. Fish and yarn crates use NOGEM (gems folded into yarn and cards).
const MIX_STD = {
  common: mixRow(0.22, 0.38, 0.05, 0.30, 0.05),
  rare:   mixRow(0.28, 0.36, 0.12, 0.18, 0.06),
  epic:   mixRow(0.34, 0.30, 0.22, 0.06, 0.08),
  legend: mixRow(0.42, 0.24, 0.28, 0.00, 0.06),
  mythic: mixRow(0.46, 0.20, 0.34, 0.00, 0.00),
};
const noGems = (m) => {
  const out = {};
  for (const r of RARITY_IDS) {
    const row = m[r];
    // gem share goes to yarn (cheap crates) so totals stay exactly 1
    out[r] = mixRow(row.cat, row.card, row.relic, +(row.yarn + row.gems).toFixed(4), 0);
  }
  return out;
};

const YARN_BASE = { common: 20, rare: 70, epic: 260, legend: 900, mythic: 3200 };
const scaleYarn = (k) => Object.fromEntries(RARITY_IDS.map((r) => [r, Math.round(YARN_BASE[r] * k)]));
const GEM_BASE = { common: 1, rare: 2, epic: 4, legend: 8, mythic: 15 };
const scaleGems = (k) => Object.fromEntries(RARITY_IDS.map((r) => [r, Math.round(GEM_BASE[r] * k)]));
const NO_GEMS_AMT = { common: 0, rare: 0, epic: 0, legend: 0, mythic: 0 };

export const CRATES = [
  {
    id: 'alley_crate', name: 'Cardboard Box', tier: 1,
    blurb: 'A soggy box from the alley. Something rattles inside.',
    weights: { common: 78, rare: 19, epic: 2.85, legend: 0.15, mythic: 0 },
    pity: { epic: { soft: 25, hard: 40 }, legend: null, mythic: null },
    mix: noGems(MIX_STD), yarn: scaleYarn(0.5), gems: NO_GEMS_AMT,
    golden: GOLDEN_CHANCE,
    multi: { count: MULTI_COUNT, guarantee: 'rare' },
    art: { body: 'slate', trim: 'boneDim', glow: 'cyan' },
    reveal: { shakeMs: 700, openMs: 500, perDropMs: 420, tellBase: 0.15, fakeOutChance: 0.12 },
  },
  {
    id: 'neon_crate', name: 'Tuna Tin', tier: 2,
    blurb: 'Pull the ring. Smells like victory and fish.',
    weights: { common: 62, rare: 29, epic: 8, legend: 1, mythic: 0 },
    pity: { epic: { soft: 12, hard: 20 }, legend: { soft: 100, hard: 150 }, mythic: null },
    mix: noGems(MIX_STD), yarn: scaleYarn(0.7), gems: NO_GEMS_AMT,
    golden: GOLDEN_CHANCE,
    multi: { count: MULTI_COUNT, guarantee: 'rare' },
    art: { body: 'cyanDeep', trim: 'cyan', glow: 'cyan' },
    reveal: { shakeMs: 800, openMs: 550, perDropMs: 440, tellBase: 0.18, fakeOutChance: 0.14 },
  },
  {
    id: 'rooftop_crate', name: 'Neon Chest', tier: 3,
    blurb: 'Hums with trapped light. Paid in yarn.',
    weights: { common: 45, rare: 38, epic: 14.5, legend: 2.3, mythic: 0.2 },
    pity: { epic: { soft: 9, hard: 15 }, legend: { soft: 60, hard: 90 }, mythic: { soft: 300, hard: 400 } },
    mix: noGems(MIX_STD), yarn: scaleYarn(0.6), gems: NO_GEMS_AMT,
    golden: GOLDEN_CHANCE,
    multi: { count: MULTI_COUNT, guarantee: 'epic' },
    art: { body: 'violet', trim: 'magenta', glow: 'magenta' },
    reveal: { shakeMs: 900, openMs: 600, perDropMs: 480, tellBase: 0.22, fakeOutChance: 0.16 },
  },
  {
    id: 'midnight_crate', name: 'Velvet Vault', tier: 4,
    blurb: 'Locked with a velvet rope. Gems open it.',
    weights: { common: 20, rare: 45, epic: 28, legend: 6, mythic: 1 },
    pity: { epic: { soft: 5, hard: 8 }, legend: { soft: 28, hard: 40 }, mythic: { soft: 150, hard: 200 } },
    mix: MIX_STD, yarn: scaleYarn(1), gems: scaleGems(1),
    golden: GOLDEN_CHANCE,
    multi: { count: MULTI_COUNT, guarantee: 'epic' },
    art: { body: 'ink3', trim: 'violetHi', glow: 'violetHi' },
    reveal: { shakeMs: 1000, openMs: 700, perDropMs: 520, tellBase: 0.28, fakeOutChance: 0.18 },
  },
  {
    id: 'mythic_crate', name: 'Mythic Reliquary', tier: 5,
    blurb: 'A shrine that remembers every cat. Gems only.',
    weights: { common: 0, rare: 38, epic: 44, legend: 15, mythic: 3 },
    pity: { epic: { soft: 3, hard: 5 }, legend: { soft: 12, hard: 20 }, mythic: { soft: 35, hard: 50 } },
    mix: MIX_STD, yarn: scaleYarn(1.2), gems: scaleGems(2),
    golden: GOLDEN_CHANCE,
    multi: { count: MULTI_COUNT, guarantee: 'legend' },
    art: { body: 'ink2', trim: 'gold', glow: 'goldHot' },
    reveal: { shakeMs: 1200, openMs: 800, perDropMs: 600, tellBase: 0.32, fakeOutChance: 0.2 },
  },
];

export const CRATE_BY_ID = Object.fromEntries(CRATES.map((c) => [c.id, c]));
export const CRATE_IDS = CRATES.map((c) => c.id);

/** Beat vocabulary the opening animation understands (order = typical order of play). */
export const BEAT_KINDS = ['shake', 'rumble', 'crack', 'pulse', 'fakeout', 'flash', 'burst', 'reveal'];
