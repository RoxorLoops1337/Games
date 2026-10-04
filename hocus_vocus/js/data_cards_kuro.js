// Hocus Vocus: RoxorLoops (id `kuro`), The Beatbox Wizard: the complete card set (3 starters, 14 commons, 12 uncommons, 8 rares, no tokens).
//
// One IIFE that registers into DATA.cards (no top-level names). Data only: every number is an op field, card text is generated
// from `fx` by DATA.cardHtml, and nothing here uses a function, a clock or randomness. Tests: tests/hocus_vocus_cards_kuro.test.mjs.
// Card ids keep their old internal names (kuro_ink_bolt and so on, DESIGN section 1.1); only the display names and flavours speak
// Hocus Vocus (bible 4, HV_HEROES 2.2).
//
// THE HERO. A beatboxer who plays a whole band with one mouth: +2 damage on each of his own hits in the backing spot
// (DATA.heroes.kuro.rows), nothing in the lead. Passive In the Pocket (id `steady_hand`): the first Skill each turn grants 1 Groove.
// Groove is a plain number on the hero (status id `sumi`) that cards read and spend; it persists from turn to turn inside one fight.
// Skills are therefore cheap fuel: several cards count Skills played (Build-Up, Word of Mouth, Layer Upon Layer) and the free ones
// (Flip It, Second Wind, Double Time+) are free Groove triggers.
//
// THREE ARCHETYPES (each has applicators or generators, payoffs, an engine and a finisher; many cards bridge two of them)
//   EARWORMS AND HEAT  Earworm and Sizzle, damage over time that wins long fights.
//           Applicators   Catchy Hook, Nod Along (all), Click Clack, Spicy Snare, Heatwave (spread), Slow Jam (grows).
//           Multiplier    Double Time doubles Earworm (aimed at ONE enemy on purpose: see notes).
//           Payoffs       Chart Topper (5 per Earworm, clunky three Breath), Scratch Combo (per debuff, fed by Wee Woo).
//           Engines       Word of Mouth (Skills spread Earworm), On Repeat (Earworm on all every turn), Crowd Goes Wild (a win heats the rest).
//           Finisher      Monster Solo, the X cost solo.
//   THE DROP  Build the Groove, then drop it all.
//           Generators    Count It In, Heartbeat (Opener), Layer Upon Layer (every Skill), Sample Chop, Pass the Mic, Back and Forth.
//           Sinks         Drop the Beat, Throat Bass (all enemies), Snare Roll (random hits, each with the +2 backing bonus), Got Your
//                         Back (Block for the ally), Imperfect Harmony (Block for both), Wait For It (the held finisher).
//   THE ARRANGER  Card manipulation, and it works on the WHOLE shared deck, the partner's cards and the curses enemies add included.
//           Crate Digging (tutor from the top), Flip It (cycle), Sample Chop (Fade junk into Block and Groove), Second Wind (the only
//           Breath, paid in HP), Pass the Mic (a swap that draws), Slow Jam (Hold, grows with the turn), Loop Station (copy up to two
//           cards, three upgraded, powers and the partner's cards included), Back and Forth (a swap engine).
//
// TWO SPOTS. RoxorLoops wants the backing spot but is not helpless in the lead (the partner may be a backing hero, or lose their voice):
// Beat Box doubles its Block there, Spicy Snare sizzles hotter, Rimshot cantrips, Pass the Mic and Back and Forth turn the swap itself
// into value.
// THE PARTNER. Every ally effect is good with anyone: Block (Shoulder to Shoulder, Got Your Back, Pass the Mic, Imperfect Harmony),
// Shimmy (Dance Break), Muffled and Exposed on the enemy (Wee Woo), wins by any hero (Crowd Goes Wild), any swap (Back and Forth), and
// the pick cards handle both heroes' cards. None reads a resource that only one hero owns.
//
// NOTES FOR THE BALANCE WAVE AND THE TEXT WRITERS
//   * `consume` with a V.upTo is the "spend up to N" idiom: the count is capped and so is what is removed. Wait For It and Imperfect
//     Harmony spend ALL Groove (consume 'sumi').
//   * `who:'target'` counters inside a `tgt:'all'` op are evaluated per victim, so a doubling op aimed at all enemies would double each
//     enemy's own stack; Double Time aims at one enemy on purpose.
//   * DATA.cardPlain prints a `hits` V or a `repeat` V without its base, so no card puts a base in one (Snare Roll is two ops:
//     one hit, then one hit per Groove spent). An upgrade must change a number the text prints.
//   * Loop Station copies powers too: two copies of On Repeat register two hooks (DESIGN 4.4). Its pick has no type filter.
//   * Crowd Goes Wild and Back and Forth use filter hero:'any': Earworm and Sizzle wins credit the LEAD hero (RoxorLoops stands in the
//     backing spot), and any swap in the party pays out, not only one RoxorLoops made.
//   * onPlay hooks a card registers do not fire for that same play (engine rule), so Word of Mouth and Layer Upon Layer start paying
//     with the next Skill.
//   * No card relies on `hand` ops for a hero card, on cross-file card ids, or on anything CONTENT_SPEC 3.2 forbids. The idea of a
//     power that adds Earworm whenever you DRAW is not expressible (no draw hook); Word of Mouth adds it on Skills instead.
(() => {
  const cards = {
    // ------------------------------------------------------------------ starters
    kuro_ink_bolt: {
      name: 'Kick Drum', hero: 'kuro', type: 'attack', rarity: 'starter', cost: 1,
      fx: [{ op: 'dmg', n: 6, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: 8, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'ink_splash', c: 'violet', hero: true },
      flavor: 'Boots. The cats come later.',
    },
    kuro_ink_ward: {
      name: 'Hi-Hat Guard', hero: 'kuro', type: 'skill', rarity: 'starter', cost: 1,
      fx: [{ op: 'block', n: 5, tgt: 'self' }],
      up: { fx: [{ op: 'block', n: 7, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'barrier', c: 'indigo' },
    },
    kuro_first_stroke: {
      name: 'Drop the Beat', hero: 'kuro', type: 'attack', rarity: 'starter', cost: 1,
      fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'sumi', mul: 3, upTo: 2 }, tgt: 'enemy', consume: { s: 'sumi', upTo: 2 } }],
      up: { fx: [{ op: 'dmg', n: { base: 5, per: 'status', s: 'sumi', mul: 4, upTo: 2 }, tgt: 'enemy', consume: { s: 'sumi', upTo: 2 } }] },
      kw: [], slots: ['red'], art: { m: 'brush_stroke', c: 'azure', hero: true },
      flavor: 'Every great set starts with one smug little drop.',
    },

    // ------------------------------------------------------------------ commons (14)
    kuro_ink_flick: {
      name: 'Rimshot', hero: 'kuro', type: 'attack', rarity: 'common', cost: 0,
      fx: [{ op: 'dmg', n: 3, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'draw', n: 1 }] }],
      up: { fx: [{ op: 'dmg', n: 4, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'draw', n: 1 }] }] },
      kw: [], slots: ['red'], art: { m: 'quill', c: 'teal' },
      flavor: 'Ba dum tss. He will be here all week.',
    },
    kuro_cinder_note: {
      name: 'Spicy Snare', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: 4, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 3, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'status', s: 'burn', n: 2, tgt: 'enemy' }] }],
      up: { fx: [{ op: 'dmg', n: 5, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 4, tgt: 'enemy' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'status', s: 'burn', n: 2, tgt: 'enemy' }] }] },
      kw: [], slots: ['red'], art: { m: 'flame_orb', c: 'amber' },
    },
    kuro_viper_nib: {
      name: 'Click Clack', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: 2, hits: 2, tgt: 'enemy' }, { op: 'status', s: 'poison', n: 2, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: 2, hits: 2, tgt: 'enemy' }, { op: 'status', s: 'poison', n: 4, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'thorns', c: 'jade', hero: true },
      flavor: 'Two clicks. Now it is in your head for the rest of the day.',
    },
    kuro_ink_flood: {
      name: 'Throat Bass', hero: 'kuro', type: 'attack', rarity: 'common', cost: 2,
      fx: [{ op: 'dmg', n: { base: 4, per: 'status', s: 'sumi', mul: 2, upTo: 3 }, tgt: 'all', consume: { s: 'sumi', upTo: 3 } }],
      up: { fx: [{ op: 'dmg', n: { base: 5, per: 'status', s: 'sumi', mul: 3, upTo: 3 }, tgt: 'all', consume: { s: 'sumi', upTo: 3 } }] },
      kw: [], slots: ['red'], art: { m: 'ink_wave', c: 'indigo', hero: true },
      flavor: 'Nobody knows where he keeps the subwoofer.',
    },
    kuro_running_script: {
      name: 'Build-Up', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'dmg', n: { base: 2, per: 'skillsPlayed', mul: 3, upTo: 3 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: { base: 2, per: 'skillsPlayed', mul: 4, upTo: 3 }, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'crane', c: 'teal' },
    },
    kuro_blinding_blot: {
      name: 'Wee Woo', hero: 'kuro', type: 'attack', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'enemy' }, { op: 'status', s: 'vulnerable', n: 1, tgt: 'enemy' }, { op: 'dmg', n: 3, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'enemy' }, { op: 'status', s: 'vulnerable', n: 2, tgt: 'enemy' }, { op: 'dmg', n: 4, tgt: 'enemy' }] },
      kw: [], slots: ['red'], art: { m: 'eye', c: 'ash' },
    },
    kuro_venom_script: {
      name: 'Catchy Hook', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: 4, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'poison', n: 5, tgt: 'enemy' }] },
      kw: [], slots: ['green'], art: { m: 'skull', c: 'jade' },
      flavor: 'It is only four bars long. It will last all week.',
    },
    kuro_miasma_verse: {
      name: 'Nod Along', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }],
      up: { fx: [{ op: 'status', s: 'poison', n: 3, tgt: 'all' }] },
      kw: [], slots: ['gold'], art: { m: 'wind', c: 'jade' },
    },
    kuro_grind_ink: {
      name: 'Count It In', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 3, tgt: 'self' }, { op: 'status', s: 'sumi', n: 2, tgt: 'self' }],
      up: { fx: [{ op: 'block', n: 3, tgt: 'self' }, { op: 'status', s: 'sumi', n: 3, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'calligraphy', c: 'violet' },
    },
    kuro_skim_the_scroll: {
      name: 'Crate Digging', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 4, tgt: 'self' }, { op: 'pick', from: 'draw', top: 3, n: 1, then: 'toHand' }],
      up: { fx: [{ op: 'block', n: 5, tgt: 'self' }, { op: 'pick', from: 'draw', top: 5, n: 1, then: 'toHand' }] },
      kw: [], slots: ['blue'], art: { m: 'scroll', c: 'moon' },
      flavor: 'Somewhere in this crate is the right beat. Ah. There it is.',
    },
    kuro_redraft: {
      name: 'Flip It', hero: 'kuro', type: 'skill', rarity: 'common', cost: 0,
      fx: [{ op: 'pick', from: 'hand', n: 2, optional: true, then: 'discard' }, { op: 'draw', n: { per: 'picked' } }],
      up: { kw: ['retain'] },
      kw: [], slots: ['green'], art: { m: 'quill', c: 'ash' },
    },
    kuro_ink_cloak: {
      name: 'Beat Box', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 6, tgt: 'self' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 6, tgt: 'self' }] }],
      up: { fx: [{ op: 'block', n: 8, tgt: 'self' }, { op: 'cond', if: { row: 'front' }, then: [{ op: 'block', n: 6, tgt: 'self' }] }] },
      kw: [], slots: ['blue'], art: { m: 'mask', c: 'ink' },
      flavor: 'Beat. Box. He has explained this joke many times.',
    },
    kuro_shared_umbrella: {
      name: 'Shoulder to Shoulder', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'block', n: 4, tgt: 'both' }],
      up: { fx: [{ op: 'block', n: 5, tgt: 'both' }] },
      kw: [], slots: ['blue'], art: { m: 'fan', c: 'rose' },
      flavor: 'He calls it a tactical formation. It is a hug.',
    },
    kuro_ghost_ink: {
      name: 'Dance Break', hero: 'kuro', type: 'skill', rarity: 'common', cost: 1,
      fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'ally' }],
      up: { fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'ally' }, { op: 'block', n: 3, tgt: 'self' }] },
      kw: [], slots: ['blue'], art: { m: 'spirit_orb', c: 'moon' },
    },

    // ------------------------------------------------------------------ uncommons (12)
    kuro_rot_script: {
      name: 'Double Time', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'poison', n: { per: 'status', s: 'poison', who: 'target', cap: 10 }, tgt: 'enemy' }],
      up: { cost: 0 },
      kw: ['exhaust'], slots: ['green'], art: { m: 'skull', c: 'ash' },
    },
    kuro_wildfire_verse: {
      name: 'Heatwave', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 2,
      fx: [{ op: 'status', s: 'burn', n: 5, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 3, tgt: 'others' }],
      up: { fx: [{ op: 'status', s: 'burn', n: 7, tgt: 'enemy' }, { op: 'status', s: 'burn', n: 4, tgt: 'others' }] },
      kw: [], slots: ['gold'], art: { m: 'fire', c: 'crimson' }, locked: true,
    },
    kuro_inkblot_verdict: {
      name: 'Scratch Combo', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'dmg', n: { base: 2, per: 'debuffs', mul: 3 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'dmg', n: { base: 3, per: 'debuffs', mul: 4 }, tgt: 'enemy' }] },
      kw: [], slots: ['red', 'gold'], art: { m: 'sigil', c: 'violet', hero: true },
      flavor: 'Wikka wikka. That is the polite version.',
    },
    kuro_creeping_ink: {
      name: 'Word of Mouth', hero: 'kuro', type: 'power', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 2, fx: [{ op: 'status', s: 'poison', n: 1, tgt: 'random' }] }],
      up: { fx: [{ op: 'hook', on: 'onPlay', filter: { type: 'skill' }, limit: 2, fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'random' }] }] },
      kw: [], slots: ['gold'], art: { m: 'web', c: 'teal' },
      flavor: 'One beat, passed from mouth to mouth, until all of the Soundlands know it.',
    },
    kuro_rain_of_strokes: {
      name: 'Snare Roll', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 2,
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
      name: 'Heartbeat', hero: 'kuro', type: 'power', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { cost: 0 },
      kw: ['innate'], slots: ['gold'], art: { m: 'mirror', c: 'azure' },
      flavor: 'Ba dum. Ba dum. The oldest beat in the world.',
    },
    kuro_shelter_script: {
      name: 'Got Your Back', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'block', n: { base: 4, per: 'status', s: 'sumi', mul: 3, upTo: 2 }, tgt: 'ally', consume: { s: 'sumi', upTo: 2 } }],
      up: { fx: [{ op: 'block', n: { base: 5, per: 'status', s: 'sumi', mul: 4, upTo: 2 }, tgt: 'ally', consume: { s: 'sumi', upTo: 2 } }] },
      kw: [], slots: ['blue', 'gold'], art: { m: 'talisman', c: 'azure' },
      flavor: 'He has your back. Literally. He is standing right there.',
    },
    kuro_strikethrough: {
      name: 'Sample Chop', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
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
    },
    kuro_nightshade_verdict: {
      name: 'Chart Topper', hero: 'kuro', type: 'attack', rarity: 'uncommon', cost: 3,
      fx: [{ op: 'dmg', n: { per: 'status', s: 'poison', who: 'target', mul: 5, cap: 50 }, tgt: 'enemy' }],
      up: { cost: 2 },
      kw: [], slots: ['red', 'gold'], art: { m: 'poison_bloom', c: 'violet' },
      flavor: 'Number one in every head in the room.',
    },
    kuro_midnight_oil: {
      name: 'Second Wind', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 0,
      fx: [{ op: 'hurt', n: 3, tgt: 'self' }, { op: 'energy', n: 1 }, { op: 'draw', n: 1 }],
      up: { fx: [{ op: 'hurt', n: 2, tgt: 'self' }, { op: 'energy', n: 1 }, { op: 'draw', n: 1 }] },
      kw: ['exhaust'], slots: ['green'], art: { m: 'lantern', c: 'amber' }, locked: true,
      flavor: 'His throat says stop. His feet say one more.',
    },
    kuro_flip_the_page: {
      name: 'Pass the Mic', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
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
      name: 'Slow Jam', hero: 'kuro', type: 'skill', rarity: 'uncommon', cost: 1,
      fx: [{ op: 'status', s: 'burn', n: { per: 'turn', mul: 2, cap: 10 }, tgt: 'enemy' }],
      up: { fx: [{ op: 'status', s: 'burn', n: { per: 'turn', mul: 3, cap: 15 }, tgt: 'enemy' }] },
      kw: ['retain'], slots: ['green'], art: { m: 'fire', c: 'gold' }, locked: true,
      flavor: 'Patience, dear listener. It is still heating up.',
    },

    // ------------------------------------------------------------------ rares (8)
    kuro_grand_flourish: {
      name: 'Wait For It', hero: 'kuro', type: 'attack', rarity: 'rare', cost: 2,
      // a floor of 3, so Wait For It with the Groove spent elsewhere is still a hit (at 2 Groove it was a 2 Breath card for 10)
      fx: [{ op: 'dmg', n: { base: 3, per: 'status', s: 'sumi', mul: 5 }, tgt: 'enemy', consume: 'sumi' }],
      up: { fx: [{ op: 'dmg', n: { base: 3, per: 'status', s: 'sumi', mul: 6 }, tgt: 'enemy', consume: 'sumi' }] },
      kw: ['retain'], slots: ['red', 'gold'], art: { m: 'calligraphy', c: 'gold', hero: true },
      flavor: 'Wait for it. Wait for it. Okay, now.',
    },
    kuro_inkfall_inferno: {
      name: 'Monster Solo', hero: 'kuro', type: 'attack', rarity: 'rare', cost: 'X',
      fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 4, tgt: 'all' }, { op: 'status', s: 'burn', n: 1, tgt: 'all' }] }],
      up: { fx: [{ op: 'repeat', n: { per: 'X' }, do: [{ op: 'dmg', n: 5, tgt: 'all' }, { op: 'status', s: 'burn', n: 1, tgt: 'all' }] }] },
      kw: [], slots: ['red', 'green'], art: { m: 'meteor', c: 'crimson' },
      flavor: 'He was meant to be backing. Nobody told his solo.',
    },
    kuro_plague_garden: {
      name: 'On Repeat', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }] }],
      up: { fx: [{ op: 'hook', on: 'turnStart', fx: [{ op: 'status', s: 'poison', n: 3, tgt: 'all' }] }] },
      kw: [], slots: ['gold', 'green'], art: { m: 'poison_bloom', c: 'jade' },
      flavor: 'You will hear it in the shower. You will hear it in your dreams.',
    },
    kuro_epilogue_flame: {
      name: 'Crowd Goes Wild', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      // a power that does nothing until the first win lost to every cheap card in short fights, so it heats the line at once
      fx: [{ op: 'status', s: 'burn', n: 2, tgt: 'all' }, { op: 'hook', on: 'onKill', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }] }],
      up: { fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }, { op: 'hook', on: 'onKill', filter: { hero: 'any' }, fx: [{ op: 'status', s: 'burn', n: 4, tgt: 'all' }] }] },
      kw: [], slots: ['gold', 'green'], art: { m: 'fire', c: 'ink' }, locked: true,
      flavor: 'Every win gets a cheer. Every cheer makes it hotter in here.',
    },
    kuro_ink_reservoir: {
      name: 'Layer Upon Layer', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      // two Groove on the spot (it cost 2 and paid nothing until the next Skill, 4.5 a Breath against a band of 4 to 12)
      fx: [{ op: 'status', s: 'sumi', n: 2, tgt: 'self' }, { op: 'hook', on: 'onPlay', filter: { type: 'skill' }, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { cost: 1 },
      kw: [], slots: ['gold', 'any'], art: { m: 'koi', c: 'indigo' },
      flavor: 'How many layers is too many? He has never found out.',
    },
    kuro_second_edition: {
      name: 'Loop Station', hero: 'kuro', type: 'skill', rarity: 'rare', cost: 1,
      // it cost 2, which left one Breath to play the copies it made (the worst RoxorLoops rare in simulation); at 1 it is a real engine
      fx: [{ op: 'pick', from: 'hand', n: 2, optional: true, then: 'copy' }],
      up: { fx: [{ op: 'pick', from: 'hand', n: 3, optional: true, then: 'copy' }] },
      kw: ['exhaust'], slots: ['any', 'green'], art: { m: 'book', c: 'moon' }, locked: true,
      flavor: 'Just for emergencies. It is always an emergency.',
    },
    kuro_scene_change: {
      name: 'Back and Forth', hero: 'kuro', type: 'power', rarity: 'rare', cost: 2,
      fx: [{ op: 'hook', on: 'onSwap', filter: { hero: 'any' }, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      up: { fx: [{ op: 'hook', on: 'onSwap', filter: { hero: 'any' }, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 2, tgt: 'self' }] }] },
      kw: [], slots: ['gold', 'blue'], art: { m: 'mask', c: 'crimson' }, locked: true,
      flavor: 'You lead, I back. I lead, you back. Nobody sits down.',
    },
    kuro_inkwash_sanctum: {
      name: 'Imperfect Harmony', hero: 'kuro', type: 'skill', rarity: 'rare', cost: 2,
      // a floor of 3 Block, so it is a wall even with the Groove spent on something else (it was empty at 0 and weak at 2)
      fx: [{ op: 'block', n: { base: 3, per: 'status', s: 'sumi', mul: 3 }, tgt: 'both', consume: 'sumi' }],
      up: { fx: [{ op: 'block', n: { base: 3, per: 'status', s: 'sumi', mul: 4 }, tgt: 'both', consume: 'sumi' }] },
      kw: [], slots: ['blue', 'any'], art: { m: 'lotus', c: 'azure' },
      flavor: 'A hair off the grid, a little wobbly, and completely real.',
    },
  };

  DATA.add('cards', cards);
})();
