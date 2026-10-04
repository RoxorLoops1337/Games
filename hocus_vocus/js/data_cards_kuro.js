// Echowake -- Kuro, the Songweaver: the complete card set (3 starters, 14 commons, 12 uncommons, 8 rares, no tokens).
//
// One IIFE that registers into DATA.cards (no top-level names). Data only: every number is an op field, card text is generated
// from `fx` by DATA.cardHtml, and nothing here uses a function, a clock or randomness. Tests: tests/hocus_vocus_cards_kuro.test.mjs.
// Card ids keep their old internal names (kuro_ink_bolt and so on, DESIGN section 1.1); only the display names and flavours changed.
//
// THE HERO. A back row mage: +2 damage on each of his own hits in the back row (DATA.heroes.kuro.rows), nothing in front.
// Passive Steady Breath: the first Skill each turn grants 1 Breath. Breath is a plain number on the hero (status id `sumi`) that
// cards read and spend; it persists from turn to turn inside one fight. Skills are therefore cheap fuel: several cards count Skills
// played (Running Scale, Creeping Drone, Bottomless Lungs) and the free ones (Remix, Midnight Session, Rot Reprise+) are free Breath
// triggers.
//
// THREE ARCHETYPES (each has applicators or generators, payoffs, an engine and a finisher; many cards bridge two of them)
//   DIRGE   Poison and Burn, damage over time that wins long fights.
//           Applicators   Venom Lullaby, Miasma Chant (all), Viper Trill, Cinder Note, Wildfire Anthem (spread), Slow Match (grows).
//           Multiplier    Rot Reprise doubles Poison (aimed at ONE enemy on purpose: see notes).
//           Payoffs       Nightshade Requiem (5 per Poison, clunky three Energy), Dissonance (per debuff, fed by Shrill Whistle).
//           Engines       Creeping Drone (Skills poison), Plague Garden (poison all every turn), Coda Flame (a kill lights the rest).
//           Finisher      Inferno Cadenza, the X cost inferno.
//   BREATH  Build the resource, then pour it out.
//           Generators    Deep Breath, Circular Breathing (innate), Bottomless Lungs (every Skill), Cut the Noise, Key Change,
//                         Call and Response.
//           Sinks         Overture, Sound Swell (all enemies), Rain of Notes (random hits, each with the +2 row bonus), Shelter
//                         Hymn (Block for the ally), Resonant Sanctum (Block for both), Grand Finale (the retained finisher).
//   ARRANGER  Card manipulation, and it works on the WHOLE shared deck, the partner's cards and the curses enemies add included.
//           Sound Check (tutor from the top), Remix (cycle), Cut the Noise (exhaust junk into Block and Breath), Midnight Session
//           (the only Energy, paid in HP), Key Change (a swap that draws), Slow Match (retain, grows with the turn), Canon (copy up
//           to two cards, three upgraded, powers and the partner's cards included), Call and Response (a swap engine).
//
// TWO ROWS. Kuro wants the back row but is not helpless in front (the partner may be a back row hero, or fall): Quiet Cloak doubles
// its Block there, Cinder Note burns hotter, Grace Note cantrips, Key Change and Call and Response turn the swap itself into value.
// THE PARTNER. Every ally effect is good with anyone: Block (Shared Umbrella, Shelter Hymn, Key Change, Resonant Sanctum), Dodge
// (Ghost Note), Vulnerable and Weak on the enemy (Shrill Whistle), kills of any hero (Coda Flame), any swap (Call and Response), and
// the pick cards handle both heroes' cards. None reads a resource that only one hero owns.
//
// NOTES FOR THE BALANCE WAVE AND THE TEXT WRITERS
//   * `consume` with a V.upTo is the "spend up to N" idiom: the count is capped and so is what is removed. Grand Finale and Resonant
//     Sanctum spend ALL Breath (consume 'sumi').
//   * `who:'target'` counters inside a `tgt:'all'` op are evaluated per victim, so a doubling op aimed at all enemies would double each
//     enemy's own stack; Rot Reprise aims at one enemy on purpose.
//   * DATA.cardPlain prints a `hits` V or a `repeat` V without its base, so no card puts a base in one (Rain of Notes is two ops:
//     one hit, then one hit per Breath spent). An upgrade must change a number the text prints.
//   * Canon copies powers too: two copies of Plague Garden register two hooks (DESIGN 4.4). Its pick has no type filter.
//   * Coda Flame and Call and Response use filter hero:'any': poison and burn kills credit the FRONT hero (Kuro stands back), and any
//     swap in the party pays out, not only one Kuro made.
//   * onPlay hooks a card registers do not fire for that same play (engine rule), so Creeping Drone and Bottomless Lungs start paying
//     with the next Skill.
//   * No card relies on `hand` ops for a hero card, on cross-file card ids, or on anything CONTENT_SPEC 3.2 forbids. The idea of a
//     power that poisons whenever you DRAW is not expressible (no draw hook); Creeping Drone poisons on Skills instead.
(() => {
  const cards = {
    // ------------------------------------------------------------------ starters
    kuro_ink_bolt: {
      name: 'Sharp Note', hero: 'kuro', type: 'attack', rarity: 'starter', cost: 1,
      fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: 8, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'ink_splash', c: 'violet', hero: true },
    },
    kuro_ink_ward: {
      name: 'Flute Guard', hero: 'kuro', type: 'skill', rarity: 'starter', cost: 1,
      fx: [{ op: 'block', n: 5, tgt: 'self' }],
      up: { fx: [{ op: 'block', n: 7, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'indigo' },
    },
    kuro_first_stroke: {
      name: 'Overture', hero: 'kuro', type: 'attack', rarity: 'starter', cost: 1,
      fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'sumi', mul: 3, upTo: 2 }, tgt: 'enemy', consume: { s: 'sumi', upTo: 2 } }],
      up: { fx: [{ op: 'dmg', n: { base: 5, per: 'status', s: 'sumi', mul: 4, upTo: 2 }, tgt: 'enemy', consume: { s: 'sumi', upTo: 2 } }] },
      kw: [], slots: ['red'], art: { m: 'brush_stroke', c: 'azure', hero: true },
      flavor: 'Every masterpiece starts with one smug first note.',
    },

    // ------------------------------------------------------------------ commons (14)
    kuro_ink_flick: {
      name: 'Grace Note', hero: 'kuro', type: 'attack', rarity: 'common', cost: 0,
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
      name: 'Viper Trill', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: 2, hits: 2, tgt: 'enemy' }, { op: 'status', s: 'poison', n: 2, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: 2, hits: 2, tgt: 'enemy' }, { op: 'status', s: 'poison', n: 4, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'thorns', c: 'jade', hero: true },
      flavor: 'The trill is quick. The bite is quicker.',
    },
    kuro_ink_flood: {
      name: 'Sound Swell', hero: 'kuro', type: 'attack', rarity: 'common', cost: 2,
      fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'sumi', mul: 2, upTo: 3 }, tgt: 'all', consume: { s: 'sumi', upTo: 3 } }],
      up: { fx: [{ op: 'dmg', n: { base: 5, per: 'status', s: 'sumi', mul: 3, upTo: 3 }, tgt: 'all', consume: { s: 'sumi', upTo: 3 } }] },
      kw: [], slots: ['red'], art: { m: 'ink_wave', c: 'indigo', hero: true },
      flavor: 'Kuro apologises for the volume. He does not mean it.',
    },
    kuro_running_script: {
      name: 'Running Scale', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: { base: 2, per: 'skillsPlayed', mul: 3, upTo: 3 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: { base: 2, per: 'skillsPlayed', mul: 4, upTo: 3 }, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'crane', c: 'teal' },
      flavor: 'Fast, fluid, and impossible to hum along to.',
    },
    kuro_blinding_blot: {
      name: 'Shrill Whistle', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'enemy' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'enemy' }, { op: 'dmg', n: 3, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'enemy' }, { op: 'status', s: 'vulnerable', n: 2, tgt: 'enemy' }, { op: 'dmg', n: 4, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'eye', c: 'ash' },
    },
    kuro_venom_script: {
      name: 'Venom Lullaby', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: 4, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'poison', n: 5, tgt: 'enemy' }] },
      kw: [], slots: ['green'], art: { m: 'skull', c: 'jade' },
      flavor: 'Best heard softly, and from a safe distance.',
    },
    kuro_miasma_verse: {
      name: 'Miasma Chant', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }],
      up: { fx: [{ op: 'status', s: 'poison', n: 3, tgt: 'all' }] },
      kw: [], slots: ['gold'], art: { m: 'wind', c: 'jade' },
    },
    kuro_grind_ink: {
      name: 'Deep Breath', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 3, tgt: 'self' }, { op: 'status', s: 'sumi', n: 2, tgt: 'self' }],
      up: { fx: [{ op: 'block', n: 3, tgt: 'self' }, { op: 'status', s: 'sumi', n: 3, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'calligraphy', c: 'violet' },
    },
    kuro_skim_the_scroll: {
      name: 'Sound Check', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 4, tgt: 'self' }, { op: 'pick', from: 'draw', top: 3, n: 1, then: 'toHand' }],
      up: { fx: [{ op: 'block', n: 5, tgt: 'self' }, { op: 'pick', from: 'draw', top: 5, n: 1, then: 'toHand' }] },
      kw: [], slots: ['blue'], art: { m: 'scroll', c: 'moon' },
      flavor: 'He heard the last bar first. It helps.',
    },
    kuro_redraft: {
      name: 'Remix', hero: 'kuro', type: 'skill', rarity: 'common', cost: 0,
      fx: [{ op: 'pick', from: 'hand', n: 2, optional: true, then: 'discard' }, { op: 'draw', n: { per: 'picked' } }],
      up: { kw: ['retain'] },
      kw: [], slots: ['green'], art: { m: 'quill', c: 'ash' },
    },
    kuro_ink_cloak: {
      name: 'Quiet Cloak', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 6, tgt: 'self' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 6, tgt: 'self' }] }],
      up: { fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 6, tgt: 'self' }] }] },
      kw: [], slots: ['blue'], art: { m: 'mask', c: 'ink' },
      flavor: 'The trick to hiding is to be the quietest thing in the room.',
    },
    kuro_shared_umbrella: {
      name: 'Shared Umbrella', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 4, tgt: 'both' }],
      up: { fx: [{ op: 'block', n: 5, tgt: 'both' }] },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'rose' },
      flavor: 'Kuro insists it is a purely practical arrangement.',
    },
    kuro_ghost_ink: {
      name: 'Ghost Note', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'ally' }],
      up: { fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'ally' }, { op: 'block', n: 3, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'spirit_orb', c: 'moon' },
    },

    // ------------------------------------------------------------------ uncommons (12)
    kuro_rot_script: {
      name: 'Rot Reprise', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: { per: 'status', s: 'poison', who: 'target', cap: 10 }, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: ['exhaust'], slots: ['green'], art: { m: 'skull', c: 'ash' },
      flavor: 'It compounds, like a bad debt.',
    },
    kuro_wildfire_verse: {
      name: 'Wildfire Anthem', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 2,
      fx: [{ op: 'status', s: 'burn', n: 5, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 3, tgt: 'others' }],
      up: { fx: [{ op: 'status', s: 'burn', n: 7, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 4, tgt: 'others' }] },
      kw: [], slots: ['gold'], art: { m: 'fire', c: 'crimson' }, locked: true,
    },
    kuro_inkblot_verdict: {
      name: 'Dissonance', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'dmg', n: { base: 2, per: 'debuffs', mul: 3 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: { base: 3, per: 'debuffs', mul: 4 }, tgt: 'enemy' }] },
      kw: [], slots: ['red', 'gold'], art: { m: 'sigil', c: 'violet', hero: true },
      flavor: 'The verdict is in. It is out of tune.',
    },
    kuro_creeping_ink: {
      name: 'Creeping Drone', hero: 'kuro', type: 'power', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 2, fx: [{ op: 'status', s: 'poison', n: 1, tgt: 'random' }] }],
      up: { fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 2, fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'random' }] }] },
      kw: [], slots: ['gold'], art: { m: 'web', c: 'teal' },
      flavor: 'It hums between the beats.',
    },
    kuro_rain_of_strokes: {
      name: 'Rain of Notes', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 2,
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
      name: 'Circular Breathing', hero: 'kuro', type: 'power', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { cost: 0 },
      kw: ['innate'], slots: ['gold'], art: { m: 'mirror', c: 'azure' },
      flavor: 'In through the nose, out through the flute, forever.',
    },
    kuro_shelter_script: {
      name: 'Shelter Hymn', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'block', n: { base: 4, per: 'status', s: 'sumi', mul: 3, upTo: 2 }, tgt: 'ally', consume: { s: 'sumi', upTo: 2 } }],
      up: { fx: [{ op: 'block', n: { base: 5, per: 'status', s: 'sumi', mul: 4, upTo: 2 }, tgt: 'ally', consume: { s: 'sumi', upTo: 2 } }] },
      kw: [], slots: ['blue', 'gold'], art: { m: 'talisman', c: 'azure' },
      flavor: 'A note in the score: please stand behind this.',
    },
    kuro_strikethrough: {
      name: 'Cut the Noise', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
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
      flavor: 'Cut it. Cut all of it.',
    },
    kuro_nightshade_verdict: {
      name: 'Nightshade Requiem', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 3,
      fx: [{ op: 'dmg', n: { per: 'status', s: 'poison', who: 'target', mul: 5, cap: 50 }, tgt: 'enemy' }],
      up: { cost: 2 },
      kw: [], slots: ['red', 'gold'], art: { m: 'poison_bloom', c: 'violet' },
      flavor: 'Sweet on the ear. Bitter everywhere else.',
    },
    kuro_midnight_oil: {
      name: 'Midnight Session', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 0,
      fx: [{ op: 'hurt', n: 3, tgt: 'self' }, { op: 'energy', n: 1 }, { op: 'draw', n: 1 }],
      up: { fx: [{ op: 'hurt', n: 2, tgt: 'self' }, { op: 'energy', n: 1 }, { op: 'draw', n: 1 }] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'lantern', c: 'amber' }, locked: true,
      flavor: 'Sleep is for the well-rehearsed.',
    },
    kuro_flip_the_page: {
      name: 'Key Change', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
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
      flavor: 'Patience, dear listener. It is still lit.',
    },

    // ------------------------------------------------------------------ rares (8)
    kuro_grand_flourish: {
      name: 'Grand Finale', hero: 'kuro', type: 'attack', rarity: 'rare', cost: 2,
      // a floor of 3, so a Flourish with the Sumi spent elsewhere is still a hit (at 2 Sumi it was a 2 Energy card for 10)
      fx: [{ op: 'dmg', n: { base: 3, per: 'status', s: 'sumi', mul: 5 }, tgt: 'enemy', consume: 'sumi' }],
      up: { fx: [{ op: 'dmg', n: { base: 3, per: 'status', s: 'sumi', mul: 6 }, tgt: 'enemy', consume: 'sumi' }] },
      kw: ['retain'], slots: ['red', 'gold'], art: { m: 'calligraphy', c: 'gold', hero: true },
      flavor: 'The last note is always the sharpest part.',
    },
    kuro_inkfall_inferno: {
      name: 'Inferno Cadenza', hero: 'kuro', type: 'attack', rarity: 'rare', cost: 'X',
      fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4, tgt: 'all' }, { op: 'status', s: 'burn', n: 1, tgt: 'all' }] }],
      up: { fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 5, tgt: 'all' }, { op: 'status', s: 'burn', n: 1, tgt: 'all' }] }] },
      kw: [], slots: ['red', 'green'], art: { m: 'meteor', c: 'crimson' },
      flavor: 'Some songs you do not end. You set them alight.',
    },
    kuro_plague_garden: {
      name: 'Plague Garden', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }] }],
      up: { fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'poison', n: 3, tgt: 'all' }] }] },
      kw: [], slots: ['gold', 'green'], art: { m: 'poison_bloom', c: 'jade' },
      flavor: 'He waters it with lullabies. Everything else wilts.',
    },
    kuro_epilogue_flame: {
      name: 'Coda Flame', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      // a power that does nothing until the first kill lost to every cheap card in short fights, so it lights the line at once
      fx: [{ op: 'status', s: 'burn', n: 2, tgt: 'all' }, { op: 'hook', on: 'onKill', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }] }],
      up: { fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }, { op: 'hook', on: 'onKill', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'burn', n: 4, tgt: 'all' }] }] },
      kw: [], slots: ['gold', 'green'], art: { m: 'fire', c: 'ink' }, locked: true,
      flavor: 'Every song earns a bonfire at the end.',
    },
    kuro_ink_reservoir: {
      name: 'Bottomless Lungs', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      // two Sumi on the spot (it cost 2 and paid nothing until the next Skill, 4.5 a Energy against a band of 4 to 12)
      fx: [{ op: 'status', s: 'sumi', n: 2, tgt: 'self' }, { op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'any'], art: { m: 'koi', c: 'indigo' },
      flavor: 'A deep breath. Do not ask what breathes back.',
    },
    kuro_second_edition: {
      name: 'Canon', hero: 'kuro', type: 'skill', rarity: 'rare', cost: 1,
      // it cost 2, which left one Energy to play the copies it made (the worst Kuro rare in simulation); at 1 it is a real engine
      fx: [{ op: 'pick', from: 'hand', n: 2, optional: true, then: 'copy' }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, optional: true, then: 'copy' }] },
      kw: ['exhaust'], slots: ['any', 'green'], art: { m: 'book', c: 'moon' }, locked: true,
      flavor: 'Again, a beat behind, and suspiciously familiar.',
    },
    kuro_scene_change: {
      name: 'Call and Response', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      fx: [{ op: 'hook', on: 'onSwap', filter: { hero: 'any' }, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { fx: [{ op: 'hook', on: 'onSwap', filter: { hero: 'any' }, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 2, tgt: 'self' }] }] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'mask', c: 'crimson' }, locked: true,
      flavor: 'One calls, one answers, and the song gets louder.',
    },
    kuro_inkwash_sanctum: {
      name: 'Resonant Sanctum', hero: 'kuro', type: 'skill', rarity: 'rare', cost: 2,
      // a floor of 3 Block, so it is a wall even with the Sumi spent on something else (it was empty at 0 and weak at 2)
      fx: [{ op: 'block', n: { base: 3, per: 'status', s: 'sumi', mul: 3 }, tgt: 'both', consume: 'sumi' }],
      up: { fx: [{ op: 'block', n: { base: 3, per: 'status', s: 'sumi', mul: 4 }, tgt: 'both', consume: 'sumi' }] },
      kw: [], slots: ['blue', 'any'], art: { m: 'lotus', c: 'azure' },
      flavor: 'The safest place in any song is the rest between the notes.',
    },
  };

  DATA.add('cards', cards);
})();
