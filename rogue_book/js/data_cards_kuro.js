// Inkwoven -- Kuro, the Inkweaver: the complete card set (3 starters, 14 commons, 12 uncommons, 8 rares, no tokens).
//
// One IIFE that registers into DATA.cards (no top-level names). Data only: every number is an op field, card text is generated
// from `fx` by DATA.cardHtml, and nothing here uses a function, a clock or randomness. Tests: tests/rogue_book_cards_kuro.test.mjs.
//
// THE HERO. A back row mage: +2 damage on each of his own hits in the back row (DATA.heroes.kuro.rows), nothing in front.
// Passive Steady Hand: the first Skill each turn grants 1 Sumi. Sumi is a plain number on the hero that cards read and spend; it
// persists from turn to turn inside one fight. Skills are therefore cheap fuel: several cards count Skills played (Running Script,
// Creeping Ink, Ink Reservoir) and the free ones (Redraft, Midnight Oil, Rot Script+) are free Sumi triggers.
//
// THREE ARCHETYPES (each has applicators or generators, payoffs, an engine and a finisher; many cards bridge two of them)
//   BLIGHT  Poison and Burn, damage over time that wins long fights.
//           Applicators   Venom Script, Miasma Verse (all), Viper Nib, Cinder Note, Wildfire Verse (spread), Slow Match (grows).
//           Multiplier    Rot Script doubles Poison (aimed at ONE enemy on purpose: see notes).
//           Payoffs       Nightshade Verdict (5 per Poison, clunky three Energy), Inkblot Verdict (per debuff, fed by Blinding Blot).
//           Engines       Creeping Ink (Skills poison), Plague Garden (poison all every turn), Epilogue Flame (a kill lights the rest).
//           Finisher      Inkfall Inferno, the X cost inferno.
//   SUMI    Build the resource, then pour it out.
//           Generators    Grind Ink, Well of Ink (innate), Ink Reservoir (every Skill), Strikethrough, Flip the Page, Scene Change.
//           Sinks         First Stroke, Ink Flood (all enemies), Rain of Strokes (random hits, each with the +2 row bonus), Shelter
//                         Script (Block for the ally), Inkwash Sanctum (Block for both), Grand Flourish (the retained finisher).
//   SCRIBE  Card manipulation, and it works on the WHOLE shared deck, the partner's cards and the curses enemies add included.
//           Skim the Scroll (tutor from the top), Redraft (cycle), Strikethrough (exhaust junk into Block and Sumi), Midnight Oil (the
//           only Energy, paid in HP), Flip the Page (a swap that draws), Slow Match (retain, grows with the turn), Second Edition
//           (copy up to two cards, three upgraded, powers and the partner's cards included), Scene Change (a swap engine).
//
// TWO ROWS. Kuro wants the back row but is not helpless in front (the partner may be a back row hero, or fall): Ink Cloak doubles its
// Block there, Cinder Note burns hotter, Ink Flick cantrips, Flip the Page and Scene Change turn the swap itself into value.
// THE PARTNER. Every ally effect is good with anyone: Block (Shared Umbrella, Shelter Script, Flip the Page, Inkwash Sanctum), Dodge
// (Ghost Ink), Vulnerable and Weak on the enemy (Blinding Blot), kills of any hero (Epilogue Flame), any swap (Scene Change), and the
// pick cards handle both heroes' cards. None reads a resource that only one hero owns.
//
// NOTES FOR THE BALANCE WAVE AND THE TEXT WRITERS
//   * `consume` with a V.upTo is the "spend up to N" idiom: the count is capped and so is what is removed. Grand Flourish and Inkwash
//     Sanctum spend ALL Sumi (consume 'sumi').
//   * `who:'target'` counters inside a `tgt:'all'` op are evaluated per victim, so a doubling op aimed at all enemies would double each
//     enemy's own stack; Rot Script aims at one enemy on purpose.
//   * DATA.cardPlain prints a `hits` V or a `repeat` V without its base, so no card puts a base in one (Rain of Strokes is two ops:
//     one hit, then one hit per Sumi spent). An upgrade must change a number the text prints.
//   * Second Edition copies powers too: two copies of Plague Garden register two hooks (DESIGN 4.4). Its pick has no type filter.
//   * Epilogue Flame and Scene Change use filter hero:'any': poison and burn kills credit the FRONT hero (Kuro stands back), and any
//     swap in the party pays out, not only one Kuro made.
//   * onPlay hooks a card registers do not fire for that same play (engine rule), so Creeping Ink and Ink Reservoir start paying with
//     the next Skill.
//   * No card relies on `hand` ops for a hero card, on cross-file card ids, or on anything CONTENT_SPEC 3.2 forbids. The idea of a
//     power that poisons whenever you DRAW is not expressible (no draw hook); Creeping Ink poisons on Skills instead.
(() => {
  const cards = {
    // ------------------------------------------------------------------ starters
    kuro_ink_bolt: {
      name: 'Ink Bolt', hero: 'kuro', type: 'attack', rarity: 'starter', cost: 1,
      fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: 8, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'ink_splash', c: 'violet', hero: true },
    },
    kuro_ink_ward: {
      name: 'Ink Ward', hero: 'kuro', type: 'skill', rarity: 'starter', cost: 1,
      fx: [{ op: 'block', n: 5, tgt: 'self' }],
      up: { fx: [{ op: 'block', n: 7, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'indigo' },
    },
    kuro_first_stroke: {
      name: 'First Stroke', hero: 'kuro', type: 'attack', rarity: 'starter', cost: 1,
      fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'sumi', mul: 3, upTo: 2 }, tgt: 'enemy', consume: { s: 'sumi', upTo: 2 } }],
      up: { fx: [{ op: 'dmg', n: { base: 5, per: 'status', s: 'sumi', mul: 4, upTo: 2 }, tgt: 'enemy', consume: { s: 'sumi', upTo: 2 } }] },
      kw: [], slots: ['red'], art: { m: 'brush_stroke', c: 'azure', hero: true },
      flavor: 'Every masterpiece starts with one smug flourish.',
    },

    // ------------------------------------------------------------------ commons (14)
    kuro_ink_flick: {
      name: 'Ink Flick', hero: 'kuro', type: 'attack', rarity: 'common', cost: 0,
      fx: [{ op: 'dmg', n: 3, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'draw', n: 1 }] }],
      up: { fx: [{ op: 'dmg', n: 4, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'draw', n: 1 }] }] },
      kw: [], slots: ['red'], art: { m: 'quill', c: 'teal' },
    },
    kuro_cinder_note: {
      name: 'Cinder Note', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: 4, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 3, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'status', s: 'burn', n: 2, tgt: 'enemy' }] }],
      up: { fx: [{ op: 'dmg', n: 5, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 4, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'status', s: 'burn', n: 2, tgt: 'enemy' }] }] },
      kw: [], slots: ['red'], art: { m: 'flame_orb', c: 'amber' },
    },
    kuro_viper_nib: {
      name: 'Viper Nib', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: 2, hits: 2, tgt: 'enemy' }, { op: 'status', s: 'poison', n: 2, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: 2, hits: 2, tgt: 'enemy' }, { op: 'status', s: 'poison', n: 4, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'thorns', c: 'jade', hero: true },
      flavor: 'The nib is sharp. The margin notes are sharper.',
    },
    kuro_ink_flood: {
      name: 'Ink Flood', hero: 'kuro', type: 'attack', rarity: 'common', cost: 2,
      fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'sumi', mul: 2, upTo: 3 }, tgt: 'all', consume: { s: 'sumi', upTo: 3 } }],
      up: { fx: [{ op: 'dmg', n: { base: 5, per: 'status', s: 'sumi', mul: 3, upTo: 3 }, tgt: 'all', consume: { s: 'sumi', upTo: 3 } }] },
      kw: [], slots: ['red'], art: { m: 'ink_wave', c: 'indigo', hero: true },
      flavor: 'Kuro apologises for the mess. He does not mean it.',
    },
    kuro_running_script: {
      name: 'Running Script', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: { base: 2, per: 'skillsPlayed', mul: 3, upTo: 3 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: { base: 2, per: 'skillsPlayed', mul: 4, upTo: 3 }, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'crane', c: 'teal' },
      flavor: 'Fast, fluid, and impossible to read in a hurry.',
    },
    kuro_blinding_blot: {
      name: 'Blinding Blot', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'enemy' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'enemy' }, { op: 'dmg', n: 3, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'enemy' }, { op: 'status', s: 'vulnerable', n: 2, tgt: 'enemy' }, { op: 'dmg', n: 4, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'eye', c: 'ash' },
    },
    kuro_venom_script: {
      name: 'Venom Script', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: 4, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'poison', n: 5, tgt: 'enemy' }] },
      kw: [], slots: ['green'], art: { m: 'skull', c: 'jade' },
      flavor: 'Best read slowly, and from a safe distance.',
    },
    kuro_miasma_verse: {
      name: 'Miasma Verse', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }],
      up: { fx: [{ op: 'status', s: 'poison', n: 3, tgt: 'all' }] },
      kw: [], slots: ['gold'], art: { m: 'wind', c: 'jade' },
    },
    kuro_grind_ink: {
      name: 'Grind Ink', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 3, tgt: 'self' }, { op: 'status', s: 'sumi', n: 2, tgt: 'self' }],
      up: { fx: [{ op: 'block', n: 3, tgt: 'self' }, { op: 'status', s: 'sumi', n: 3, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'calligraphy', c: 'violet' },
    },
    kuro_skim_the_scroll: {
      name: 'Skim the Scroll', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 4, tgt: 'self' }, { op: 'pick', from: 'draw', top: 3, n: 1, then: 'toHand' }],
      up: { fx: [{ op: 'block', n: 5, tgt: 'self' }, { op: 'pick', from: 'draw', top: 5, n: 1, then: 'toHand' }] },
      kw: [], slots: ['blue'], art: { m: 'scroll', c: 'moon' },
      flavor: 'He read the last page first. It helps.',
    },
    kuro_redraft: {
      name: 'Redraft', hero: 'kuro', type: 'skill', rarity: 'common', cost: 0,
      fx: [{ op: 'pick', from: 'hand', n: 2, optional: true, then: 'discard' }, { op: 'draw', n: { per: 'picked' } }],
      up: { kw: ['retain'] },
      kw: [], slots: ['green'], art: { m: 'quill', c: 'ash' },
    },
    kuro_ink_cloak: {
      name: 'Ink Cloak', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 6, tgt: 'self' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 6, tgt: 'self' }] }],
      up: { fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 6, tgt: 'self' }] }] },
      kw: [], slots: ['blue'], art: { m: 'mask', c: 'ink' },
      flavor: 'The trick to hiding is to be the darkest thing on the page.',
    },
    kuro_shared_umbrella: {
      name: 'Shared Umbrella', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 4, tgt: 'both' }],
      up: { fx: [{ op: 'block', n: 5, tgt: 'both' }] },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'rose' },
      flavor: 'Kuro insists it is a purely practical arrangement.',
    },
    kuro_ghost_ink: {
      name: 'Ghost Ink', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'ally' }],
      up: { fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'ally' }, { op: 'block', n: 3, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'spirit_orb', c: 'moon' },
    },

    // ------------------------------------------------------------------ uncommons (12)
    kuro_rot_script: {
      name: 'Rot Script', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: { per: 'status', s: 'poison', who: 'target', cap: 10 }, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: ['exhaust'], slots: ['green'], art: { m: 'skull', c: 'ash' },
      flavor: 'It compounds, like a bad debt.',
    },
    kuro_wildfire_verse: {
      name: 'Wildfire Verse', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 2,
      fx: [{ op: 'status', s: 'burn', n: 5, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 3, tgt: 'others' }],
      up: { fx: [{ op: 'status', s: 'burn', n: 7, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 4, tgt: 'others' }] },
      kw: [], slots: ['gold'], art: { m: 'fire', c: 'crimson' }, locked: true,
    },
    kuro_inkblot_verdict: {
      name: 'Inkblot Verdict', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'dmg', n: { base: 2, per: 'debuffs', mul: 3 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: { base: 3, per: 'debuffs', mul: 4 }, tgt: 'enemy' }] },
      kw: [], slots: ['red', 'gold'], art: { m: 'sigil', c: 'violet', hero: true },
      flavor: 'The verdict is in. It is a stain.',
    },
    kuro_creeping_ink: {
      name: 'Creeping Ink', hero: 'kuro', type: 'power', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 2, fx: [{ op: 'status', s: 'poison', n: 1, tgt: 'random' }] }],
      up: { fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 2, fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'random' }] }] },
      kw: [], slots: ['gold'], art: { m: 'web', c: 'teal' },
      flavor: 'It seeps between the lines.',
    },
    kuro_rain_of_strokes: {
      name: 'Rain of Strokes', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 2,
      fx: [
        { op: 'dmg', n: 4, tgt: 'random' },
        { op: 'dmg', n: 4, hits: { per: 'status', s: 'sumi', upTo: 4 }, tgt: 'random', consume: { s: 'sumi', upTo: 4 } },
      ],
      up: { fx: [
        { op: 'dmg', n: 5, tgt: 'random' },
        { op: 'dmg', n: 5, hits: { per: 'status', s: 'sumi', upTo: 4 }, tgt: 'random', consume: { s: 'sumi', upTo: 4 } },
      ] },
      kw: [], slots: ['red', 'green'], art: { m: 'sword_rain', c: 'azure', hero: true },
    },
    kuro_well_of_ink: {
      name: 'Well of Ink', hero: 'kuro', type: 'power', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { cost: 0 },
      kw: ['innate'], slots: ['gold'], art: { m: 'mirror', c: 'azure' },
      flavor: 'Deep, dark, and mildly judgemental.',
    },
    kuro_shelter_script: {
      name: 'Shelter Script', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'block', n: { base: 4, per: 'status', s: 'sumi', mul: 3, upTo: 2 }, tgt: 'ally', consume: { s: 'sumi', upTo: 2 } }],
      up: { fx: [{ op: 'block', n: { base: 5, per: 'status', s: 'sumi', mul: 4, upTo: 2 }, tgt: 'ally', consume: { s: 'sumi', upTo: 2 } }] },
      kw: [], slots: ['blue', 'gold'], art: { m: 'talisman', c: 'azure' },
      flavor: 'A note in the margin: please stand behind this.',
    },
    kuro_strikethrough: {
      name: 'Strikethrough', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [
        { op: 'pick', from: 'hand', n: 2, optional: true, then: 'exhaust' },
        { op: 'block', n: { per: 'picked', mul: 3 }, tgt: 'self' },
        { op: 'status', s: 'sumi', n: { per: 'picked' }, tgt: 'self' },
      ],
      up: { fx: [
        { op: 'pick', from: 'hand', n: 3, optional: true, then: 'exhaust' },
        { op: 'block', n: { per: 'picked', mul: 3 }, tgt: 'self' },
        { op: 'status', s: 'sumi', n: { per: 'picked' }, tgt: 'self' },
      ] },
      kw: [], slots: ['blue', 'green'], art: { m: 'cross_slash', c: 'crimson' },
      flavor: 'Cross it out. Cross it all out.',
    },
    kuro_nightshade_verdict: {
      name: 'Nightshade Verdict', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 3,
      fx: [{ op: 'dmg', n: { per: 'status', s: 'poison', who: 'target', mul: 5, cap: 50 }, tgt: 'enemy' }],
      up: { cost: 2 },
      kw: [], slots: ['red', 'gold'], art: { m: 'poison_bloom', c: 'violet' },
      flavor: 'Sweet on paper. Bitter everywhere else.',
    },
    kuro_midnight_oil: {
      name: 'Midnight Oil', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 0,
      fx: [{ op: 'hurt', n: 3, tgt: 'self' }, { op: 'energy', n: 1 }, { op: 'draw', n: 1 }],
      up: { fx: [{ op: 'hurt', n: 2, tgt: 'self' }, { op: 'energy', n: 1 }, { op: 'draw', n: 1 }] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'lantern', c: 'amber' }, locked: true,
      flavor: 'Sleep is for the well-drafted.',
    },
    kuro_flip_the_page: {
      name: 'Flip the Page', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [
        { op: 'swap' },
        { op: 'draw', n: 1 },
        { op: 'block', n: 3, tgt: 'ally' },
        { op: 'cond', if: { row: 'back' }, then: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] },
      ],
      up: { fx: [
        { op: 'swap' },
        { op: 'draw', n: 2 },
        { op: 'block', n: 3, tgt: 'ally' },
        { op: 'cond', if: { row: 'back' }, then: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] },
      ] },
      kw: [], slots: ['blue', 'green'], art: { m: 'book', c: 'teal' },
    },
    kuro_slow_match: {
      name: 'Slow Match', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'burn', n: { per: 'turn', mul: 2, cap: 10 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'burn', n: { per: 'turn', mul: 3, cap: 15 }, tgt: 'enemy' }] },
      kw: ['retain'], slots: ['green'], art: { m: 'fire', c: 'gold' }, locked: true,
      flavor: 'Patience, dear reader. It is still lit.',
    },

    // ------------------------------------------------------------------ rares (8)
    kuro_grand_flourish: {
      name: 'Grand Flourish', hero: 'kuro', type: 'attack', rarity: 'rare', cost: 2,
      // a floor of 3, so a Flourish with the Sumi spent elsewhere is still a hit (at 2 Sumi it was a 2 Energy card for 10)
      fx: [{ op: 'dmg', n: { base: 3, per: 'status', s: 'sumi', mul: 5 }, tgt: 'enemy', consume: 'sumi' }],
      up: { fx: [{ op: 'dmg', n: { base: 3, per: 'status', s: 'sumi', mul: 6 }, tgt: 'enemy', consume: 'sumi' }] },
      kw: ['retain'], slots: ['red', 'gold'], art: { m: 'calligraphy', c: 'gold', hero: true },
      flavor: 'The signature at the bottom is always the sharpest part.',
    },
    kuro_inkfall_inferno: {
      name: 'Inkfall Inferno', hero: 'kuro', type: 'attack', rarity: 'rare', cost: 'X',
      fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4, tgt: 'all' }, { op: 'status', s: 'burn', n: 1, tgt: 'all' }] }],
      up: { fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 5, tgt: 'all' }, { op: 'status', s: 'burn', n: 1, tgt: 'all' }] }] },
      kw: [], slots: ['red', 'green'], art: { m: 'meteor', c: 'crimson' },
      flavor: 'Some pages you do not turn. You set them alight.',
    },
    kuro_plague_garden: {
      name: 'Plague Garden', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }] }],
      up: { fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'poison', n: 3, tgt: 'all' }] }] },
      kw: [], slots: ['gold', 'green'], art: { m: 'poison_bloom', c: 'jade' },
      flavor: 'He waters it with footnotes. Everything else wilts.',
    },
    kuro_epilogue_flame: {
      name: 'Epilogue Flame', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      // a power that does nothing until the first kill lost to every cheap card in short fights, so it lights the line at once
      fx: [{ op: 'status', s: 'burn', n: 2, tgt: 'all' }, { op: 'hook', on: 'onKill', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }] }],
      up: { fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }, { op: 'hook', on: 'onKill', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'burn', n: 4, tgt: 'all' }] }] },
      kw: [], slots: ['gold', 'green'], art: { m: 'fire', c: 'ink' }, locked: true,
      flavor: 'Every story earns a bonfire at the end.',
    },
    kuro_ink_reservoir: {
      name: 'Ink Reservoir', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      // two Sumi on the spot (it cost 2 and paid nothing until the next Skill, 4.5 a Energy against a band of 4 to 12)
      fx: [{ op: 'status', s: 'sumi', n: 2, tgt: 'self' }, { op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'any'], art: { m: 'koi', c: 'indigo' },
      flavor: 'A deep well. Do not ask what writes back.',
    },
    kuro_second_edition: {
      name: 'Second Edition', hero: 'kuro', type: 'skill', rarity: 'rare', cost: 1,
      // it cost 2, which left one Energy to play the copies it made (the worst Kuro rare in simulation); at 1 it is a real engine
      fx: [{ op: 'pick', from: 'hand', n: 2, optional: true, then: 'copy' }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, optional: true, then: 'copy' }] },
      kw: ['exhaust'], slots: ['any', 'green'], art: { m: 'book', c: 'moon' }, locked: true,
      flavor: 'Revised, expanded, and suspiciously familiar.',
    },
    kuro_scene_change: {
      name: 'Scene Change', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      fx: [{ op: 'hook', on: 'onSwap', filter: { hero: 'any' }, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { fx: [{ op: 'hook', on: 'onSwap', filter: { hero: 'any' }, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 2, tgt: 'self' }] }] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'mask', c: 'crimson' }, locked: true,
      flavor: 'Bow, exit stage left, return with a better line.',
    },
    kuro_inkwash_sanctum: {
      name: 'Inkwash Sanctum', hero: 'kuro', type: 'skill', rarity: 'rare', cost: 2,
      // a floor of 3 Block, so it is a wall even with the Sumi spent on something else (it was empty at 0 and weak at 2)
      fx: [{ op: 'block', n: { base: 3, per: 'status', s: 'sumi', mul: 3 }, tgt: 'both', consume: 'sumi' }],
      up: { fx: [{ op: 'block', n: { base: 3, per: 'status', s: 'sumi', mul: 4 }, tgt: 'both', consume: 'sumi' }] },
      kw: [], slots: ['blue', 'any'], art: { m: 'lotus', c: 'azure' },
      flavor: 'The safest place in any story is the one nobody can read.',
    },
  };

  DATA.add('cards', cards);
})();
