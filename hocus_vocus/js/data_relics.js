// Hocus Vocus: the 66 Charms (internal id `relics`): common 22, uncommon 22, rare 12, boss 6 (Headliner Charms), shop 4 (Merch).
//
// One IIFE that registers into DATA.relics (no top-level names). Data only: `text` is the one hand written rules line (one sentence,
// at most 90 characters) and the test recomputes a machine summary of every mod, row and hook (DATA.hookText) and checks that the
// sentence carries every number, status, resource and trigger the data actually uses. `flavor` is the one optional joke line under
// it (printable ASCII, at most 80 characters, ends with . ! or ?), display only: no logic, bot or save reads it. Names, texts and
// flavours come from plan/HV_WORLD_DATA.md section 2. Tests: tests/hocus_vocus_treasure.test.mjs.
//
// HOW CHARMS DROP (DESIGN 4.9): commons, uncommons and rares come from Rival rewards, gift boxes and merch stalls in the
// ECONOMY.relicWeights mix; `boss` Charms only from the Headliner choice of three; `shop` Charms only from the merch stall's first
// Charm slot. A Charm with `hero` only drops when that hero is in the party. Locked Charms (Tour Bus unlocks) never drop until bought.
//
// ENGINE FACTS THE DESIGN LEANS ON (so nobody "fixes" them later)
//   * combatStart runs BEFORE turn 1 clears Block and tops the hand up, so it only hands out statuses, damage, healing and cards,
//     never Block or draw. First turn Block is a turnStart hook with `cond turn lte 1`.
//   * A party hook (no `hero`) is acted by the hero that triggered it (onPlay, onDamaged, onKill, onSwap, onHeroDown, onExhaust), else
//     by the LEAD hero (internal row `front`), so anything meant for both heroes says tgt 'both'. A `hero` Charm fires only for that
//     hero's own events.
//   * `limit` is per turn for combat hooks and per act for run hooks; `once` is per fight (combat) or per tour (run hooks);
//     `every` counts triggers per fight (combat) or per tour (run hooks), and never fires on the 1st trigger.
//   * The onSwap hook fires for the free swap, the paid swap and the card `swap` op, never for a forced swap.
//   * combatEnd fires on a win only, before voiceless heroes come back, so a heal there cannot lift a voiceless hero.
//   * The engine emits a `relic` event when a hook RUNS, before a `cond` inside it is checked (remembrance_candle, crescent_kanzashi and
//     lotus_sanctuary flash their icon on turns where the condition then fails). `limit`, `once` and `every` are checked first.
//   * A row bonus belongs to the SPOT, not the hero, and both spots are always occupied while two heroes have their voice. So a
//     `rows` Charm is a party wide effect in disguise: a backing spot `drawAdd` would be a free +1 hand size, which is a Headliner
//     trade, so no Charm has one.
//
// THE SET, BY JOB (every mod key, every combat and run hook and rows on both the lead and the backing spot appear at least once; the
// audit and the test check it). Breath and hand size come only from Headliner Charms and always with a drawback.
//   MAP AND VOX   brass_lantern (Tour Poster) unmutes 2 hexes an act, pilgrim_compass and plum_pendant refund Vox on unmutes,
//                 ink_jar and inkstone_weight (Giant Water Bottle) move the Vox floor and ceiling, well_kasa feeds on tea stalls,
//                 sable_brush hands out a Spell every act, shrine_box pays Vox in green rooms, jade_key adds a second green room
//                 action (and a rest heal).
//   COMMONS       small, readable, always on: 1 Block a turn, 25% gold, 25% healing, 2 HP after fights, Block on a win,
//                 Block after a hit, a Sizzle or Muffled opener, first turn Block, and so on.
//   SPOT SYSTEM   war_banner (lead damage) and formation_scroll (Stage Markers, lead Block, backing Block from cards) are `rows`
//                 Charms; fox_mask, flute_of_changing_tunes, mirror_of_two_faces and dancer_geta pay for swapping; longbow_of_reach
//                 reads the spot with a cond and remembrance_candle watches the lead hero. A hook `limit` is spent BEFORE a cond
//                 inside the hook is read, so longbow_of_reach's limit of 2 counts every Attack of the turn, whoever plays it, and
//                 only a backing spot play gets the bonus: its text says exactly that ("your first 2 Attacks each turn ... when
//                 played from the backing spot").
//   GEM CHARMS    facet_lens (gold), jewelers_loupe (draw) and prism_crown (Breath) key on `filter.gems`; koi_pouch and
//                 pearl_satchel hand out gems.
//   HEROES        three per hero, each built on that hero's resource: Jasmin (Bloom), RoxorLoops (Groove), RawClaw (Reverb), Andy
//                 (Rumble). Internal ids: hanae, kuro (resource sumi), suzu (resource ward), raiga (resource charge).
//   HEADLINER     every Headliner Charm is a real trade, and each one is a different BUILD (a Headliner offer is three of these
//   TRADES        six): tyrants_crown (Pitch Fixer) +1 Breath for 3 curses and blood_moon_vow (Stage Pyro) +1 Breath for 2 HP each
//                 every turn (the tempo picks), book_of_falling_leaves (Glowing Phone) +1 card for 40% weaker healing (the engine
//                 pick), ironclad_tsuba (Flight Case) Block and Feedback for one card fewer (the turtle and retaliation pick),
//                 bottomless_gourd (Extra Spicy Noodles) 3 Volume against 2 Exposed at the start of every fight (the glass cannon:
//                 neutral in trash fights, big against Rivals and Headliners) and toll_bridge (Golden Ticket) a free tier 3 gem plus
//                 two more reward cards against dearer stalls (the draft pick; it gives a gem, not a card choice, because a Headliner
//                 Charm is claimed on the reward page and a pending card pick there would stall the page tests).
//                 Measured in the relic lab (recorded greedy fights refought at full HP, party HP lost per fight as a share of max
//                 HP against no Headliner Charm, 2500 fights, plus or minus 0.2): +1 Breath alone -4.9, Flight Case -3.7, Noodles -1.7
//                 (Headliner and Rival fights -3 to -14), Glowing Phone -1.9, Pitch Fixer with 3 unremoved curses +0.6, Stage Pyro
//                 with 2 HP +4.1. A startBlock point is worth about 1.8, a hand point about 2.7.
//   MERCH         four Charms sold at 160 gold: cheaper stalls, gold after every fight, a heal after every won fight, a free gem
//                 for every merch stall visited.
//
// ICONS AND COLOURS. All 58 LISTS.relicIcons are used and none more than twice; the palette is spread over all 12 hues.
(() => {
  const relics = {
    // ================================================================== COMMON (22)
    brass_lantern: {
      name: 'Tour Poster', rarity: 'common', art: { m: 'lantern', c: 'amber' },
      text: 'At the start of each act, unmute 2 hexes for free towards the headliner.',
      flavor: 'Jordan drew the whole route on it, with the headliner\'s name in glitter.',
      hooks: [{ on: 'onChapterStart', fx: [{ op: 'paint', n: 2 }] }],
    },
    paper_umbrella: {
      name: 'Pop Filter', rarity: 'common', art: { m: 'umbrella', c: 'azure' },
      text: 'Each hero gains 1 Block at the start of every turn.',
      flavor: 'It stops the p-pops before they reach the mic, and a few other things too.',
      mods: { startBlock: 1 },
    },
    fortune_coin: {
      name: 'Busking Hat', rarity: 'common', art: { m: 'coin', c: 'gold' },
      text: 'Combat and gift box gold is 25% higher.',
      flavor: 'Upside down on the cobbles, it always comes back heavier than it went.',
      mods: { goldMul: 0.25 },
    },
    steaming_teacup: {
      name: 'Travel Mug', rarity: 'common', art: { m: 'teacup', c: 'teal' },
      text: 'Healing outside combat is 25% stronger.',
      flavor: 'Ginger and lemon for the throat, and a sticker from every stop.',
      mods: { healMul: 0.25 },
    },
    rice_ball: {
      name: 'Warm Oat Bar', rarity: 'common', art: { m: 'riceball', c: 'moon' },
      text: 'After each fight, both heroes heal 2 HP, and the one with less HP heals 2 more.',
      flavor: 'Fresh from the Snack Pier. Break it in two and give away the bigger half.',
      hooks: [{ on: 'onFightWon', fx: [{ op: 'heal', n: 2, who: 'both' }, { op: 'heal', n: 2, who: 'lowest' }] }],
    },
    wooden_comb: {
      name: 'Mixtape', rarity: 'common', art: { m: 'comb', c: 'rose' },
      text: 'Whenever you reshuffle your draw pile, both heroes gain 5 Block.',
      flavor: 'When side A ends, side B starts. Nobody remembers which side is which.',
      hooks: [{ on: 'onShuffle', fx: [{ op: 'block', n: 5, tgt: 'both' }] }],
    },
    pilgrim_compass: {
      name: 'Pitch Pipe', rarity: 'common', art: { m: 'compass', c: 'jade' },
      text: 'Every 5th hex you unmute refunds 1 Vox.',
      flavor: 'One little toot every few streets, to remember where the note lives.',
      hooks: [{ on: 'onPaint', every: 5, fx: [{ op: 'ink', n: 1 }] }],
    },
    bounty_scroll: {
      name: 'Battle Trophy', rarity: 'common', art: { m: 'scroll', c: 'ash' },
      text: 'Winning a Rival fight pays 20 extra gold.',
      flavor: 'A beatbox battle trophy, gold plastic and very proud of itself.',
      hooks: [{ on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'gold', n: 20 }] }],
    },
    ink_jar: {
      name: 'Jar of Giggles', rarity: 'common', art: { m: 'jar', c: 'indigo' },
      text: 'Start each act with 2 more Vox.',
      flavor: 'Every giggle mid-song, saved for later. Open one at the start of each act.',
      mods: { startInk: 2 },
    },
    inkstone_weight: {
      name: 'Giant Water Bottle', rarity: 'common', art: { m: 'inkstone', c: 'ink' },
      text: 'Your Vox pool can hold 2 more, and taking this gives both heroes 3 max HP.',
      flavor: 'Two whole litres. Jordan stuck nine HYDRATE stickers on it, just in case.',
      mods: { inkMax: 2 },
      hooks: [{ on: 'onPickup', fx: [{ op: 'maxHp', n: 3, who: 'both' }] }],
    },
    heart_charm: {
      name: 'Cosy Onesie', rarity: 'common', art: { m: 'heart', c: 'crimson' },
      text: 'When you take this, both heroes gain 5 max HP.',
      flavor: 'Green, with a big smiley on the belly. Somebody always packs a spare.',
      hooks: [{ on: 'onPickup', fx: [{ op: 'maxHp', n: 5, who: 'both' }] }],
    },
    wolf_fang: {
      name: 'Foam Finger', rarity: 'common', art: { m: 'tooth', c: 'ash' },
      text: 'Whenever you defeat an enemy, that hero gains 3 Block.',
      flavor: 'A giant foam hand that points at whoever just won the crowd over.',
      hooks: [{ on: 'onKill', fx: [{ op: 'block', n: 3, tgt: 'self' }] }],
    },
    sturdy_shell: {
      name: 'Gig Bag', rarity: 'common', art: { m: 'shell', c: 'teal' },
      text: 'Whenever a hero is hit, they gain 3 Block (twice a turn).',
      flavor: 'Padded, battered, and somehow still holding its zip together.',
      hooks: [{ on: 'onDamaged', limit: 2, fx: [{ op: 'block', n: 3, tgt: 'self' }] }],
    },
    ember_charm: {
      name: 'Spark Fountain', rarity: 'common', art: { m: 'flame', c: 'crimson' }, locked: true,
      text: 'At the start of combat, apply 3 Sizzle to all enemies.',
      flavor: 'Cold sparks on the first beat, and suddenly everyone else is sweating.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }] }],
    },
    paper_crane: {
      name: 'Trumpet Mute', rarity: 'common', art: { m: 'crane', c: 'moon' },
      text: 'At the start of combat, apply 1 Muffled to all enemies.',
      flavor: 'Pop it into the bell and even the loudest trumpet says please.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'all' }] }],
    },
    green_bamboo: {
      name: 'Smoke Machine', rarity: 'common', art: { m: 'bamboo', c: 'jade' },
      text: 'On the first turn of each fight, both heroes gain 6 Block.',
      flavor: 'One big puff on the first beat, and nobody can see where the band went.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'cond', if: { turn: { lte: 1 } }, then: [{ op: 'block', n: 6, tgt: 'both' }] }] }],
    },
    flute_of_changing_tunes: {
      name: 'Wireless Mic', rarity: 'common', art: { m: 'flute', c: 'violet' },
      text: 'Whenever you swap spots, draw 1 card (once per turn).',
      flavor: 'No cable, no tangles, and a great deal more running about.',
      hooks: [{ on: 'onSwap', limit: 1, fx: [{ op: 'draw', n: 1 }] }],
    },
    burnt_offering: {
      name: 'Glow Stick', rarity: 'common', art: { m: 'incense', c: 'ash' },
      text: 'Whenever a card fades, its hero gains 3 Block.',
      flavor: 'Crack it as a song fades out, and the glow lasts a little longer.',
      hooks: [{ on: 'onExhaust', fx: [{ op: 'block', n: 3, tgt: 'self' }] }],
    },
    // hero commons
    pressed_petal: {
      name: 'Pink Scrunchie', rarity: 'common', hero: 'hanae', art: { m: 'petal', c: 'rose' },
      text: 'At the start of your turn, Jasmin gains 1 Bloom.',
      flavor: 'It has never once moved, whatever happens. It smells of cherry blossom.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
    },
    vial_of_spare_ink: {
      name: 'Lime Shoes', rarity: 'common', hero: 'kuro', art: { m: 'ink_drop', c: 'violet' },
      text: 'RoxorLoops starts each combat with 3 Groove.',
      flavor: 'Bright enough to see from the cheap seats. The groove starts in the feet.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'sumi', n: 3, tgt: 'self' }] }],
    },
    mizuhiki_cord: {
      name: 'Spare Headphones', rarity: 'common', hero: 'suzu', art: { m: 'charm', c: 'crimson' },
      text: 'At the start of your turn, RawClaw gives his ally 3 Block.',
      flavor: 'He always carries a second pair, for whoever is standing next to him.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'block', n: 3, tgt: 'ally' }] }],
    },
    juzu_beads: {
      name: 'Heavy Strings', rarity: 'common', hero: 'raiga', art: { m: 'beads', c: 'amber' },
      text: 'Whenever Andy is hit, deal 3 damage to the attacker (twice a turn).',
      flavor: 'Thick, round and very low. Thump them and the floor thumps back.',
      hooks: [{ on: 'onDamaged', limit: 2, fx: [{ op: 'dmg', n: 3, tgt: 'enemy' }] }],
    },

    // ================================================================== UNCOMMON (22)
    fox_mask: {
      name: 'Goat Mask', rarity: 'uncommon', art: { m: 'mask', c: 'crimson' },
      text: 'Every 2nd time you swap spots, the new lead hero gains 1 Shimmy (once per turn).',
      flavor: 'Found on a rooftop studio. Its owner insists it is not a costume.',
      hooks: [{ on: 'onSwap', limit: 1, every: 2, fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'self' }] }],
    },
    silver_bell: {
      name: 'Triangle', rarity: 'uncommon', art: { m: 'bell', c: 'moon' },
      text: 'The first time a hero is hit each fight, both heroes gain 6 Block.',
      flavor: 'Ting. One ting, and the whole band stands up a little straighter.',
      hooks: [{ on: 'onDamaged', once: true, fx: [{ op: 'block', n: 6, tgt: 'both' }] }],
    },
    well_kasa: {
      name: 'Tour Kettle', rarity: 'uncommon', art: { m: 'kasa', c: 'jade' },
      text: 'Tea stalls give 1 more Vox.',
      flavor: 'Packed between the amp and the snacks. Every tea stall fills it up.',
      mods: { wellInk: 1 },
    },
    loaded_dice: {
      name: 'Lucky Plectrum', rarity: 'uncommon', art: { m: 'dice', c: 'rose' },
      text: 'Rare cards appear 8 percentage points more often in card rewards.',
      flavor: 'Found under a sofa backstage. Rare things have kept happening ever since.',
      mods: { rareBoost: 8 },
    },
    sable_brush: {
      name: 'Mic-Wand Keyring', rarity: 'uncommon', art: { m: 'brush', c: 'ink' },
      text: 'At the start of each act, learn a random Spell.',
      flavor: 'A tiny mic with a star on top. Give it a wave and a new trick falls out.',
      hooks: [{ on: 'onChapterStart', fx: [{ op: 'addBrush', id: 'random' }] }],
    },
    plum_pendant: {
      name: 'Blossom Badge', rarity: 'uncommon', art: { m: 'plum', c: 'rose' },
      text: 'Every 3rd hex you unmute refunds 1 Vox.',
      flavor: 'The duo\'s own cherry blossom badge. A petal drifts back every few streets.',
      hooks: [{ on: 'onPaint', every: 3, fx: [{ op: 'ink', n: 1 }] }],
    },
    shrine_box: {
      name: 'Fruit Bowl', rarity: 'uncommon', art: { m: 'shrine', c: 'gold' },
      text: 'When you rest at a green room, gain 2 Vox.',
      flavor: 'Grapes, clementines and one very brave banana, waiting backstage.',
      hooks: [{ on: 'onRest', fx: [{ op: 'ink', n: 2 }] }],
    },
    whetstone: {
      name: 'Practice Pad', rarity: 'uncommon', art: { m: 'sword', c: 'ash' },
      text: 'When you take this, upgrade 3 random cards in your deck.',
      flavor: 'Hours of quiet tap tap tap in the van. It all comes out on stage.',
      hooks: [{ on: 'onPickup', fx: [{ op: 'upgradeCard', n: 3, random: true }] }],
    },
    koi_pouch: {
      name: 'Tote Bag', rarity: 'uncommon', art: { m: 'koi', c: 'azure' }, locked: true,
      text: 'When you take this, gain a random tier 2 gem.',
      flavor: 'It has a picture of a tote bag on it. Something sparkly is inside.',
      hooks: [{ on: 'onPickup', fx: [{ op: 'addGem', tier: 2 }] }],
    },
    facet_lens: {
      name: 'Rhinestone Mic', rarity: 'uncommon', art: { m: 'mirror', c: 'teal' },
      text: 'The first time each turn you play a card with a gem, gain 3 gold and 3 Block.',
      flavor: 'Every gem catches the stage lights, and the coins come flying in.',
      hooks: [{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'gold', n: 3 }, { op: 'block', n: 3, tgt: 'self' }] }],
    },
    jewelers_loupe: {
      name: 'Glitter Glasses', rarity: 'uncommon', art: { m: 'star', c: 'gold' },
      text: 'The first time each turn you play a card with a gem, draw 1 card.',
      flavor: 'Heart-shaped and very sparkly. Anything shiny looks twice as good.',
      hooks: [{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'draw', n: 1 }] }],
    },
    war_banner: {
      name: 'Stage Light', rarity: 'uncommon', art: { m: 'sun', c: 'amber' }, locked: true,
      text: 'The lead hero deals 1 more damage with every hit.',
      flavor: 'Whoever stands in it sings a little bolder.',
      rows: { front: { dmgAdd: 1 } },
    },
    dancer_geta: {
      name: 'Roller Skates', rarity: 'uncommon', art: { m: 'geta', c: 'violet' },
      text: 'You get 1 more free swap each turn.',
      flavor: 'Nobody admits to packing them, and everybody borrows them.',
      mods: { freeSwaps: 1 },
    },
    remembrance_candle: {
      name: 'Fairy Lights', rarity: 'uncommon', art: { m: 'candle', c: 'indigo' },
      text: 'If the lead hero has no Block at the end of your turn, they gain 6 Block.',
      flavor: 'Wound round the mic stand. They twinkle on when it gets dark out front.',
      hooks: [{ on: 'turnEnd', fx: [{ op: 'cond', if: { block: { lte: 0 } }, then: [{ op: 'block', n: 6, tgt: 'front' }] }] }],
    },
    battle_drum: {
      name: 'Floor Tom', rarity: 'uncommon', art: { m: 'drum', c: 'crimson' },
      text: 'Whenever you play a card that costs 2 or more, draw 1 card (once per turn).',
      flavor: 'The biggest drum in the kit. Hit it hard and something good falls out.',
      hooks: [{ on: 'onPlay', filter: { cost: { gte: 2 } }, limit: 1, fx: [{ op: 'draw', n: 1 }] }],
    },
    hungry_skull: {
      name: 'Bag of Grapes', rarity: 'uncommon', art: { m: 'skull', c: 'ink' },
      text: 'Whenever you defeat a Creature or Rival, that hero heals 2 HP.',
      flavor: 'One grape for every crowd you win over. It is a very big bag.',
      hooks: [{ on: 'onKill', filter: { tier: ['normal', 'elite'] }, fx: [{ op: 'heal', n: 2, tgt: 'self' }] }],
    },
    longbow_of_reach: {
      name: 'Megaphone', rarity: 'uncommon', art: { m: 'bow', c: 'jade' }, locked: true,
      text: 'Your first 2 Attacks each turn deal 3 more damage when played from the backing spot.',
      flavor: 'From the back of the stage it reaches all the way to the front.',
      hooks: [{ on: 'onPlay', filter: { type: 'attack' }, limit: 2, fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'dmg', n: 3, tgt: 'enemy' }] }] }],
    },
    wintry_bell: {
      name: 'Instant Camera', rarity: 'uncommon', art: { m: 'snowflake', c: 'azure' }, locked: true,
      text: 'At the start of combat, apply 1 Exposed to all enemies.',
      flavor: 'Flash! Everyone in the photo looks a little surprised, and very exposed.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'all' }] }],
    },
    // hero uncommons
    spring_tsuba: {
      name: 'Heart Necklace', rarity: 'uncommon', hero: 'hanae', art: { m: 'katana_guard', c: 'rose' },
      text: 'Whenever Jasmin defeats an enemy, she gains 2 Bloom and 3 Block.',
      flavor: 'A little gold heart that glows warm whenever she wins somebody over.',
      hooks: [{ on: 'onKill', fx: [{ op: 'status', s: 'bloom', n: 2, tgt: 'self' }, { op: 'block', n: 3, tgt: 'self' }] }],
    },
    scholars_spectacles: {
      name: 'Smiley Tee', rarity: 'uncommon', hero: 'kuro', art: { m: 'eye', c: 'indigo' },
      text: 'Every 2nd Skill RoxorLoops plays, he draws 1 card and gains 1 Groove.',
      flavor: 'Black, with a big orange smiley that grins a bit wider on every beat.',
      hooks: [{ on: 'onPlay', filter: { type: 'skill' }, every: 2, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
    },
    crescent_kanzashi: {
      name: 'Sampler Pad', rarity: 'uncommon', hero: 'suzu', art: { m: 'moon', c: 'moon' },
      text: 'At turn start, if RawClaw has 3 or more Reverb, both heroes cleanse debuffs and heal 2 HP.',
      flavor: 'Tap the blue pad and everything sounds clean again. Not glossy, clean.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'cond', if: { status: { s: 'ward', gte: 3 } }, then: [{ op: 'removeStatus', s: 'debuffs', tgt: 'both' }, { op: 'heal', n: 2, tgt: 'both' }] }] }],
    },
    thunder_wheel: {
      name: 'Subwoofer', rarity: 'uncommon', hero: 'raiga', art: { m: 'bolt', c: 'amber' },
      text: 'Every 3rd Attack Andy plays, he gains 2 Rumble and deals 4 damage to all enemies.',
      flavor: 'Every third note, the cups on the table start to ripple.',
      hooks: [{ on: 'onPlay', filter: { type: 'attack' }, every: 3, fx: [{ op: 'status', s: 'charge', n: 2, tgt: 'self' }, { op: 'dmg', n: 4, tgt: 'all' }] }],
    },

    // ================================================================== RARE (12)
    jade_key: {
      name: 'Backstage Pass', rarity: 'rare', art: { m: 'key', c: 'jade' },
      text: 'At each green room you may take 1 more action, and a rest also heals both heroes 4 HP.',
      flavor: 'All areas. Stay as long as you like, and do have a sit down.',
      mods: { campActions: 1 },
      hooks: [{ on: 'onRest', fx: [{ op: 'heal', n: 4, who: 'both' }] }],
    },
    branching_bookmark: {
      name: 'The Viral Clip', rarity: 'rare', art: { m: 'ribbon', c: 'violet' },
      text: 'Card rewards offer 1 more card.',
      flavor: 'Somebody always has it on their phone. Since then, the offers pour in.',
      mods: { cardChoices: 1 },
    },
    phoenix_feather: {
      name: 'Spare Mic', rarity: 'rare', art: { m: 'feather', c: 'crimson' }, locked: true,
      text: 'The first time a hero loses their voice each fight, bring them back with 25% HP.',
      flavor: 'Lost your voice? Here, take this one. Jordan put a sticker on it.',
      hooks: [{ on: 'onHeroDown', once: true, fx: [{ op: 'revive', pct: 0.25 }] }],
    },
    prism_crown: {
      name: 'Unicorn Headband', rarity: 'rare', art: { m: 'crown', c: 'gold' }, locked: true,
      text: 'Whenever you play a card with 2 or more gems, gain 1 Breath (once per turn).',
      flavor: 'A rainbow mane and a gold sparkle on top. Gems feel right at home.',
      hooks: [{ on: 'onPlay', filter: { gems: { gte: 2 } }, limit: 1, fx: [{ op: 'energy', n: 1 }] }],
    },
    mirror_of_two_faces: {
      name: 'Twin Mic Stand', rarity: 'rare', art: { m: 'mirror', c: 'violet' }, locked: true,
      text: 'Whenever you swap spots, gain 1 Breath (once per turn).',
      flavor: 'Two mics on one stand. Whoever steps up takes a lovely big breath.',
      hooks: [{ on: 'onSwap', limit: 1, fx: [{ op: 'energy', n: 1 }] }],
    },
    formation_scroll: {
      name: 'Stage Markers', rarity: 'rare', art: { m: 'scroll', c: 'ink' },
      text: 'Lead hero starts turns with 3 Block, and the backing hero gains 1 extra Block from cards.',
      flavor: 'Little crosses of tape on the floor. Everyone knows exactly where to stand.',
      rows: { front: { startBlock: 3 }, back: { blockAdd: 1 } },
    },
    dragon_pearl: {
      name: 'Gold Record', rarity: 'rare', art: { m: 'dragon', c: 'teal' }, locked: true,
      text: 'Whenever you defeat a Rival, both heroes gain 2 max HP.',
      flavor: 'Framed on the wall of the van. It shines a bit brighter after every rival.',
      hooks: [{ on: 'onKill', filter: { tier: 'elite' }, fx: [{ op: 'maxHp', n: 2, tgt: 'both' }] }],
    },
    sands_of_patience: {
      name: 'Three-Bar Loop', rarity: 'rare', art: { m: 'hourglass', c: 'amber' }, locked: true,
      text: 'Every 3rd turn, gain 1 Breath and draw 1 card.',
      flavor: 'Three bars, round and round. Somehow it always lands on the one.',
      hooks: [{ on: 'turnStart', every: 3, fx: [{ op: 'energy', n: 1 }, { op: 'draw', n: 1 }] }],
    },
    // hero rares
    hundred_petal_fan: {
      name: 'Hoop Earring', rarity: 'rare', hero: 'hanae', art: { m: 'fan', c: 'rose' },
      text: 'Whenever Jasmin plays a 0-cost Attack, draw 1 card and gain 1 Bloom (twice a turn).',
      flavor: 'One gold hoop. It sways on every little note, and the little notes add up.',
      hooks: [{ on: 'onPlay', filter: { type: 'attack', cost: { lte: 0 } }, limit: 2, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
    },
    nightlong_inkwell: {
      name: 'Green Mic', rarity: 'rare', hero: 'kuro', art: { m: 'inkstone', c: 'indigo' },
      text: 'At the end of your turn, RoxorLoops applies 2 Earworm to all enemies.',
      flavor: 'Cupped in both hands, it leaves a beat stuck in every head in the room.',
      hooks: [{ on: 'turnEnd', fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }] }],
    },
    lotus_sanctuary: {
      name: 'Spring Reverb', rarity: 'rare', hero: 'suzu', art: { m: 'lotus', c: 'moon' },
      text: 'RawClaw gains 1 more Reverb a turn and at 4 spends it for Muffled on all, 3 Block on both.',
      flavor: 'Give it a shake and it goes boing. Leave it alone and it fills the room.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }, { op: 'cond', if: { status: { s: 'ward', gte: 4 } }, then: [{ op: 'removeStatus', s: 'ward', n: 4, tgt: 'self' }, { op: 'status', s: 'weak', n: 1, tgt: 'all' }, { op: 'block', n: 3, tgt: 'both' }] }] }],
    },
    stormtiger_sash: {
      name: 'Bass Cabinet', rarity: 'rare', hero: 'raiga', art: { m: 'tiger', c: 'amber' },
      text: 'Andy gains 1 Rumble when hit, and at 8 Rumble he spends it for 10 damage to all enemies.',
      flavor: 'Eight speakers and one very calm man. You feel it before you hear it.',
      hooks: [{ on: 'onDamaged', fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }, { op: 'cond', if: { status: { s: 'charge', gte: 8 } }, then: [{ op: 'removeStatus', s: 'charge', n: 8, tgt: 'self' }, { op: 'dmg', n: 10, tgt: 'all' }] }] }],
    },

    // ================================================================== BOSS (6): each one is a trade
    tyrants_crown: {
      name: 'Pitch Fixer', rarity: 'boss', art: { m: 'crown', c: 'crimson' },
      text: 'Gain 1 Breath each turn, but taking this adds 3 Curses to your deck.',
      flavor: 'Flawless! So clean! Every note perfect, and a little bit of you missing.',
      mods: { energy: 1 },
      hooks: [{ on: 'onPickup', fx: [{ op: 'addCurse', n: 3 }] }],
    },
    book_of_falling_leaves: {
      name: 'Glowing Phone', rarity: 'boss', art: { m: 'maple', c: 'amber' },
      text: 'Draw 1 more card each turn, but healing outside combat is 40% weaker.',
      flavor: 'Just one more swipe. And one more. Who needs a lie-down anyway?',
      mods: { hand: 1, healMul: -0.4 },
    },
    blood_moon_vow: {
      name: 'Stage Pyro', rarity: 'boss', art: { m: 'moon', c: 'violet' },
      text: 'Gain 1 Breath each turn, but both heroes lose 2 HP at the start of your turn.',
      flavor: 'Big flames on every chorus. Very exciting, and just a little bit toasty.',
      mods: { energy: 1 },
      hooks: [{ on: 'turnStart', fx: [{ op: 'hurt', n: 2, tgt: 'both' }] }],
    },
    toll_bridge: {
      name: 'Golden Ticket', rarity: 'boss', art: { m: 'bridge', c: 'gold' },
      text: 'Taking this gives a tier 3 gem and 2 more cards per reward, but stall prices rise 25%.',
      flavor: 'Everything is on offer now, and everything costs a little more.',
      mods: { cardChoices: 2, priceMul: 0.25 },
      hooks: [{ on: 'onPickup', fx: [{ op: 'addGem', tier: 3 }] }],
    },
    ironclad_tsuba: {
      name: 'Flight Case', rarity: 'boss', art: { m: 'katana_guard', c: 'ash' },
      text: 'Heroes gain 2 Block a turn and start fights with 3 Feedback, but you draw 1 fewer card.',
      flavor: 'Heavy, dented and covered in stickers. Hit it and it squeals right back.',
      mods: { startBlock: 2, hand: -1 },
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'thorns', n: 3, tgt: 'both' }] }],
    },
    bottomless_gourd: {
      name: 'Extra Spicy Noodles', rarity: 'boss', art: { m: 'gourd', c: 'teal' }, locked: true,
      text: 'Both heroes start each fight with 3 Volume, but also with 2 Exposed.',
      flavor: 'Too hot to taste and too good to stop. You sing louder, and you sweat.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'might', n: 3, tgt: 'both' }, { op: 'status', s: 'vulnerable', n: 2, tgt: 'both' }] }],
    },

    // ================================================================== SHOP (4): sold for 160 gold, nowhere else
    fox_haggler_token: {
      name: 'Crew Lanyard', rarity: 'shop', art: { m: 'fox', c: 'amber' },
      text: 'All merch stall prices are 20% lower.',
      flavor: 'Jordan\'s own design. Flash it at any stall for the crew price.',
      mods: { priceMul: -0.2 },
    },
    merchants_seal: {
      name: 'Sticker Sheet', rarity: 'shop', art: { m: 'seal', c: 'crimson' },
      text: 'After every fight, gain 8 gold.',
      flavor: 'Hand them out after the show. Somehow the coins come back the other way.',
      hooks: [{ on: 'onFightWon', fx: [{ op: 'gold', n: 8 }] }],
    },
    apothecary_jar: {
      name: 'Post-Show Smoothie', rarity: 'shop', art: { m: 'jar', c: 'jade' },
      text: 'At the end of each fight you win, both heroes heal 3 HP.',
      flavor: 'Mango, banana and ginger, blended on the back of a bike by the pier.',
      hooks: [{ on: 'combatEnd', fx: [{ op: 'heal', n: 3, tgt: 'both' }] }],
    },
    pearl_satchel: {
      name: 'Mystery Pin', rarity: 'shop', art: { m: 'shell', c: 'azure' }, locked: true,
      text: 'When you enter a merch stall, gain a random tier 1 gem.',
      flavor: 'Jordan slips one into every bag. Nobody knows which until it sparkles.',
      hooks: [{ on: 'onShopEnter', fx: [{ op: 'addGem', tier: 1 }] }],
    },
  };

  DATA.add('relics', relics);
})();
