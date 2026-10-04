// Echowake -- the 66 relics ("Treasures"): common 22, uncommon 22, rare 12, boss 6, shop 4.
//
// One IIFE that registers into DATA.relics (no top-level names). Data only: `text` is the one hand written line (one sentence, at
// most 90 characters) and the test recomputes a machine summary of every mod, row and hook (DATA.hookText) and checks that the
// sentence carries every number, status, resource and trigger the data actually uses. Tests: tests/hocus_vocus_treasure.test.mjs.
//
// HOW RELICS DROP (DESIGN 4.9): commons, uncommons and rares come from elite rewards, chests and shops in the ECONOMY.relicWeights
// mix; `boss` relics only from the boss choice of three; `shop` relics only from the shop's first relic slot. A relic with `hero`
// only drops when that hero is in the party. Locked relics (Library unlocks) never drop until bought.
//
// ENGINE FACTS THE DESIGN LEANS ON (so nobody "fixes" them later)
//   * combatStart runs BEFORE turn 1 clears Block and tops the hand up, so it only hands out statuses, damage, healing and cards,
//     never Block or draw. First turn Block is a turnStart hook with `cond turn lte 1`.
//   * A party hook (no `hero`) is acted by the hero that triggered it (onPlay, onDamaged, onKill, onSwap, onHeroDown, onExhaust), else
//     by the FRONT hero, so anything meant for both heroes says tgt 'both'. A `hero` relic fires only for that hero's own events.
//   * `limit` is per turn for combat hooks and per verse for run hooks; `once` is per fight (combat) or per run (run hooks);
//     `every` counts triggers per fight (combat) or per run (run hooks), and never fires on the 1st trigger.
//   * The onSwap hook fires for the free swap, the paid swap and the card `swap` op, never for a forced swap.
//   * combatEnd fires on a win only, before downed heroes revive, so a heal there cannot lift a fallen hero.
//   * The engine emits a `relic` event when a hook RUNS, before a `cond` inside it is checked (remembrance_candle, crescent_kanzashi and
//     lotus_sanctuary flash their icon on turns where the condition then fails). `limit`, `once` and `every` are checked first.
//   * A row bonus belongs to the ROW, not the hero, and both rows are always occupied while two heroes live. So a `rows` relic
//     is a party wide effect in disguise: a back row `drawAdd` would be a free +1 hand size, which is a boss trade, so no relic has one.
//
// THE SET, BY JOB (every mod key, every combat and run hook and rows on both the front and the back row appear at least once; the
// audit and the test check it). Energy and hand size come only from boss relics and always with a drawback.
//   MAP AND ECHO  brass_lantern wakes 2 hexes a verse, pilgrim_compass and plum_pendant refund Echo on wakes, ink_jar and
//                 inkstone_weight (Heavy Singing Bowl) move the Echo floor and ceiling, well_kasa feeds on temple bells, sable_brush hands
//                 out a Song every verse, shrine_box pays Echo at camps, jade_key adds a second camp action (and a rest heal).
//   COMMONS       small, readable, always on: 1 Block a turn, 25% gold, 25% healing, 2 HP after fights, Block on a kill,
//                 Block after a hit, a Burn or Weak opener, first turn Block, and so on.
//   ROW SYSTEM    war_banner (front damage) and formation_scroll (Marching Cadence, front Block, back Block from cards) are `rows` relics; fox_mask,
//                 flute_of_changing_tunes, mirror_of_two_faces and dancer_geta pay for swapping; longbow_of_reach reads the
//                 row with a cond and remembrance_candle watches the front hero. A hook `limit` is spent BEFORE a cond inside the hook
//                 is read, so longbow_of_reach's limit of 2 counts every Attack of the turn, whoever plays it, and only a back row
//                 play gets the bonus: its text says exactly that ("your first 2 Attacks each turn ... when played from the back row").
//   GEM RELICS    facet_lens (gold), jewelers_loupe (draw) and prism_crown (Energy) key on `filter.gems`; koi_pouch and
//                 pearl_satchel hand out gems.
//   HEROES        three per hero, each built on that hero's resource: Hanae (Bloom), Kuro (Breath), Suzu (Ward), Raiga (Charge).
//   BOSS TRADES   every boss relic is a real trade, and each one is a different BUILD (a boss offer is three of these six):
//                 tyrants_crown +1 Energy for 3 curses and blood_moon_vow +1 Energy for 2 HP each every turn (the tempo picks),
//                 song_of_falling_leaves (id book_of_falling_leaves) +1 card for 40% weaker healing (the engine pick), ironclad_tsuba Block and Thorns for one
//                 card fewer (the turtle and retaliation pick), bottomless_gourd 3 Might against 2 Vulnerable at the start of every
//                 fight (the glass cannon: neutral in trash fights, big against elites and bosses) and toll_bridge a free rare
//                 a tier 3 gem plus two more reward cards against dearer shops (the draft pick; it gives a gem, not a card choice, because a
//                 boss relic is claimed on the reward page and a pending card pick there would stall the page tests).
//                 Measured in the relic lab (recorded greedy fights refought at full HP, party HP lost per fight as a share of max
//                 HP against no boss relic, 2500 fights, plus or minus 0.2): +1 Energy alone -4.9, Tsuba -3.7, Gourd -1.7 (boss
//                 and elite fights -3 to -14), Book -1.9, Crown with 3 unremoved curses +0.6, Vow with 2 HP +4.1. A startBlock point
//                 is worth about 1.8, a hand point about 2.7.
//   SHOP          four relics sold at 160 gold: cheaper shops, gold after every fight, a heal after every won fight, a free gem
//                 for every shop visited.
//
// ICONS AND COLOURS. All 58 LISTS.relicIcons are used and none more than twice; the palette is spread over all 12 hues.
(() => {
  const relics = {
    // ================================================================== COMMON (22)
    brass_lantern: {
      name: 'Brass Lantern', rarity: 'common', art: { m: 'lantern', c: 'amber' },
      text: 'At the start of each verse, wake 2 hexes for free toward the boss.',
      hooks: [{ on: 'onChapterStart', fx: [{ op: 'paint', n: 2 }] }],
    },
    paper_umbrella: {
      name: 'Oil-Paper Umbrella', rarity: 'common', art: { m: 'umbrella', c: 'azure' },
      text: 'Each hero gains 1 Block at the start of every turn.',
      mods: { startBlock: 1 },
    },
    fortune_coin: {
      name: 'Fortune Coin', rarity: 'common', art: { m: 'coin', c: 'gold' },
      text: 'Combat and chest gold is 25% higher.',
      mods: { goldMul: 0.25 },
    },
    steaming_teacup: {
      name: 'Steaming Teacup', rarity: 'common', art: { m: 'teacup', c: 'teal' },
      text: 'Healing outside combat is 25% stronger.',
      mods: { healMul: 0.25 },
    },
    rice_ball: {
      name: 'Rice Ball', rarity: 'common', art: { m: 'riceball', c: 'moon' },
      text: 'After each fight, both heroes heal 2 HP, and the one with less HP heals 2 more.',
      hooks: [{ on: 'onFightWon', fx: [{ op: 'heal', n: 2, who: 'both' }, { op: 'heal', n: 2, who: 'lowest' }] }],
    },
    wooden_comb: {
      name: 'Wooden Comb', rarity: 'common', art: { m: 'comb', c: 'rose' },
      text: 'Whenever you reshuffle your draw pile, both heroes gain 5 Block.',
      hooks: [{ on: 'onShuffle', fx: [{ op: 'block', n: 5, tgt: 'both' }] }],
    },
    pilgrim_compass: {
      name: 'Pilgrim\'s Compass', rarity: 'common', art: { m: 'compass', c: 'jade' },
      text: 'Every 5th hex you wake refunds 1 Echo.',
      hooks: [{ on: 'onPaint', every: 5, fx: [{ op: 'ink', n: 1 }] }],
    },
    bounty_scroll: {
      name: 'Bounty Scroll', rarity: 'common', art: { m: 'scroll', c: 'ash' },
      text: 'Winning an Elite fight pays 20 extra gold.',
      hooks: [{ on: 'onFightWon', filter: { tier: 'elite' }, fx: [{ op: 'gold', n: 20 }] }],
    },
    ink_jar: {
      name: 'Bottled Echo', rarity: 'common', art: { m: 'jar', c: 'indigo' },
      text: 'Start each verse with 2 more Echo.',
      mods: { startInk: 2 },
    },
    inkstone_weight: {
      name: 'Heavy Singing Bowl', rarity: 'common', art: { m: 'inkstone', c: 'ink' },
      text: 'Your Echo pool can hold 2 more, and taking this gives both heroes 3 max HP.',
      mods: { inkMax: 2 },
      hooks: [{ on: 'onPickup', fx: [{ op: 'maxHp', n: 3, who: 'both' }] }],
    },
    heart_charm: {
      name: 'Heartwood Charm', rarity: 'common', art: { m: 'heart', c: 'crimson' },
      text: 'When you take this, both heroes gain 5 max HP.',
      hooks: [{ on: 'onPickup', fx: [{ op: 'maxHp', n: 5, who: 'both' }] }],
    },
    wolf_fang: {
      name: 'Wolf Fang', rarity: 'common', art: { m: 'tooth', c: 'ash' },
      text: 'Whenever you defeat an enemy, that hero gains 3 Block.',
      hooks: [{ on: 'onKill', fx: [{ op: 'block', n: 3, tgt: 'self' }] }],
    },
    sturdy_shell: {
      name: 'Tortoise Shell', rarity: 'common', art: { m: 'shell', c: 'teal' },
      text: 'Whenever a hero is hit, they gain 3 Block (twice a turn).',
      hooks: [{ on: 'onDamaged', limit: 2, fx: [{ op: 'block', n: 3, tgt: 'self' }] }],
    },
    ember_charm: {
      name: 'Ember Charm', rarity: 'common', art: { m: 'flame', c: 'crimson' }, locked: true,
      text: 'At the start of combat, apply 3 Burn to all enemies.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'burn', n: 3, tgt: 'all' }] }],
    },
    paper_crane: {
      name: 'Paper Crane', rarity: 'common', art: { m: 'crane', c: 'moon' },
      text: 'At the start of combat, apply 1 Weak to all enemies.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'weak', n: 1, tgt: 'all' }] }],
    },
    green_bamboo: {
      name: 'Green Bamboo', rarity: 'common', art: { m: 'bamboo', c: 'jade' },
      text: 'On the first turn of each fight, both heroes gain 6 Block.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'cond', if: { turn: { lte: 1 } }, then: [{ op: 'block', n: 6, tgt: 'both' }] }] }],
    },
    flute_of_changing_tunes: {
      name: 'Flute of Changing Tunes', rarity: 'common', art: { m: 'flute', c: 'violet' },
      text: 'Whenever you swap rows, draw 1 card (once per turn).',
      hooks: [{ on: 'onSwap', limit: 1, fx: [{ op: 'draw', n: 1 }] }],
    },
    burnt_offering: {
      name: 'Burnt Offering', rarity: 'common', art: { m: 'incense', c: 'ash' },
      text: 'Whenever a card is Exhausted, its hero gains 3 Block.',
      hooks: [{ on: 'onExhaust', fx: [{ op: 'block', n: 3, tgt: 'self' }] }],
    },
    // hero commons
    pressed_petal: {
      name: 'Pressed Petal', rarity: 'common', hero: 'hanae', art: { m: 'petal', c: 'rose' },
      text: 'At the start of your turn, Hanae gains 1 Bloom.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
    },
    vial_of_spare_ink: {
      name: 'Spare Mouthpiece', rarity: 'common', hero: 'kuro', art: { m: 'ink_drop', c: 'violet' },
      text: 'Kuro starts each combat with 3 Breath.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'sumi', n: 3, tgt: 'self' }] }],
    },
    mizuhiki_cord: {
      name: 'Mizuhiki Cord', rarity: 'common', hero: 'suzu', art: { m: 'charm', c: 'crimson' },
      text: 'At the start of your turn, Suzu gives her ally 3 Block.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'block', n: 3, tgt: 'ally' }] }],
    },
    juzu_beads: {
      name: 'Juzu Beads', rarity: 'common', hero: 'raiga', art: { m: 'beads', c: 'amber' },
      text: 'Whenever Raiga is hit, deal 3 damage to the attacker (twice a turn).',
      hooks: [{ on: 'onDamaged', limit: 2, fx: [{ op: 'dmg', n: 3, tgt: 'enemy' }] }],
    },

    // ================================================================== UNCOMMON (22)
    fox_mask: {
      name: 'Fox Mask', rarity: 'uncommon', art: { m: 'mask', c: 'crimson' },
      text: 'Every 2nd time you swap rows, the new front hero gains 1 Dodge (once per turn).',
      hooks: [{ on: 'onSwap', limit: 1, every: 2, fx: [{ op: 'status', s: 'dodge', n: 1, tgt: 'self' }] }],
    },
    silver_bell: {
      name: 'Silver Bell', rarity: 'uncommon', art: { m: 'bell', c: 'moon' },
      text: 'The first time a hero is hit each fight, both heroes gain 6 Block.',
      hooks: [{ on: 'onDamaged', once: true, fx: [{ op: 'block', n: 6, tgt: 'both' }] }],
    },
    well_kasa: {
      name: 'Bell-Ringer\'s Kasa', rarity: 'uncommon', art: { m: 'kasa', c: 'jade' },
      text: 'Temple Bells give 1 more Echo.',
      mods: { wellInk: 1 },
    },
    loaded_dice: {
      name: 'Loaded Dice', rarity: 'uncommon', art: { m: 'dice', c: 'rose' },
      text: 'Rare cards appear 8 percentage points more often in card rewards.',
      mods: { rareBoost: 8 },
    },
    sable_brush: {
      name: 'Songbird Whistle', rarity: 'uncommon', art: { m: 'brush', c: 'ink' },
      text: 'At the start of each verse, learn a random Song.',
      hooks: [{ on: 'onChapterStart', fx: [{ op: 'addBrush', id: 'random' }] }],
    },
    plum_pendant: {
      name: 'Plum Blossom Pendant', rarity: 'uncommon', art: { m: 'plum', c: 'rose' },
      text: 'Every 3rd hex you wake refunds 1 Echo.',
      hooks: [{ on: 'onPaint', every: 3, fx: [{ op: 'ink', n: 1 }] }],
    },
    shrine_box: {
      name: 'Offering Box', rarity: 'uncommon', art: { m: 'shrine', c: 'gold' },
      text: 'When you rest at a camp, gain 2 Echo.',
      hooks: [{ on: 'onRest', fx: [{ op: 'ink', n: 2 }] }],
    },
    whetstone: {
      name: 'Honing Stone', rarity: 'uncommon', art: { m: 'sword', c: 'ash' },
      text: 'When you take this, upgrade 3 random cards in your deck.',
      hooks: [{ on: 'onPickup', fx: [{ op: 'upgradeCard', n: 3, random: true }] }],
    },
    koi_pouch: {
      name: 'Koi Pouch', rarity: 'uncommon', art: { m: 'koi', c: 'azure' }, locked: true,
      text: 'When you take this, gain a random tier 2 gem.',
      hooks: [{ on: 'onPickup', fx: [{ op: 'addGem', tier: 2 }] }],
    },
    facet_lens: {
      name: 'Facet Lens', rarity: 'uncommon', art: { m: 'mirror', c: 'teal' },
      text: 'The first time each turn you play a card with a gem, gain 3 gold and 3 Block.',
      hooks: [{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'gold', n: 3 }, { op: 'block', n: 3, tgt: 'self' }] }],
    },
    jewelers_loupe: {
      name: 'Jeweler\'s Loupe', rarity: 'uncommon', art: { m: 'star', c: 'gold' },
      text: 'The first time each turn you play a card with a gem, draw 1 card.',
      hooks: [{ on: 'onPlay', filter: { gems: { gte: 1 } }, limit: 1, fx: [{ op: 'draw', n: 1 }] }],
    },
    war_banner: {
      name: 'War Banner', rarity: 'uncommon', art: { m: 'sun', c: 'amber' }, locked: true,
      text: 'The front hero deals 1 more damage with every hit.',
      rows: { front: { dmgAdd: 1 } },
    },
    dancer_geta: {
      name: 'Dancer\'s Geta', rarity: 'uncommon', art: { m: 'geta', c: 'violet' },
      text: 'You get 1 more free swap each turn.',
      mods: { freeSwaps: 1 },
    },
    remembrance_candle: {
      name: 'Remembrance Candle', rarity: 'uncommon', art: { m: 'candle', c: 'indigo' },
      text: 'If the front hero has no Block at the end of your turn, they gain 6 Block.',
      hooks: [{ on: 'turnEnd', fx: [{ op: 'cond', if: { block: { lte: 0 } }, then: [{ op: 'block', n: 6, tgt: 'front' }] }] }],
    },
    battle_drum: {
      name: 'Battle Drum', rarity: 'uncommon', art: { m: 'drum', c: 'crimson' },
      text: 'Whenever you play a card that costs 2 or more, draw 1 card (once per turn).',
      hooks: [{ on: 'onPlay', filter: { cost: { gte: 2 } }, limit: 1, fx: [{ op: 'draw', n: 1 }] }],
    },
    hungry_skull: {
      name: 'Hungry Skull', rarity: 'uncommon', art: { m: 'skull', c: 'ink' },
      text: 'Whenever you defeat a normal or elite enemy, that hero heals 2 HP.',
      hooks: [{ on: 'onKill', filter: { tier: ['normal', 'elite'] }, fx: [{ op: 'heal', n: 2, tgt: 'self' }] }],
    },
    longbow_of_reach: {
      name: 'Longbow of Reach', rarity: 'uncommon', art: { m: 'bow', c: 'jade' }, locked: true,
      text: 'Your first 2 Attacks each turn deal 3 more damage when played from the back row.',
      hooks: [{ on: 'onPlay', filter: { type: 'attack' }, limit: 2, fx: [{ op: 'cond', if: { row: 'back' }, then: [{ op: 'dmg', n: 3, tgt: 'enemy' }] }] }],
    },
    wintry_bell: {
      name: 'Wintry Bell', rarity: 'uncommon', art: { m: 'snowflake', c: 'azure' }, locked: true,
      text: 'At the start of combat, apply 1 Vulnerable to all enemies.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'vulnerable', n: 1, tgt: 'all' }] }],
    },
    // hero uncommons
    spring_tsuba: {
      name: 'Spring Tsuba', rarity: 'uncommon', hero: 'hanae', art: { m: 'katana_guard', c: 'rose' },
      text: 'Whenever Hanae defeats an enemy, she gains 2 Bloom and 3 Block.',
      hooks: [{ on: 'onKill', fx: [{ op: 'status', s: 'bloom', n: 2, tgt: 'self' }, { op: 'block', n: 3, tgt: 'self' }] }],
    },
    scholars_spectacles: {
      name: 'Pocket Metronome', rarity: 'uncommon', hero: 'kuro', art: { m: 'eye', c: 'indigo' },
      text: 'Every 2nd Skill Kuro plays, he draws 1 card and gains 1 Breath.',
      hooks: [{ on: 'onPlay', filter: { type: 'skill' }, every: 2, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
    },
    crescent_kanzashi: {
      name: 'Crescent Kanzashi', rarity: 'uncommon', hero: 'suzu', art: { m: 'moon', c: 'moon' },
      text: 'At turn start, if Suzu has 3 or more Ward, both heroes cleanse debuffs and heal 2 HP.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'cond', if: { status: { s: 'ward', gte: 3 } }, then: [{ op: 'removeStatus', s: 'debuffs', tgt: 'both' }, { op: 'heal', n: 2, tgt: 'both' }] }] }],
    },
    thunder_wheel: {
      name: 'Thunder Wheel', rarity: 'uncommon', hero: 'raiga', art: { m: 'bolt', c: 'amber' },
      text: 'Every 3rd Attack Raiga plays, he gains 2 Charge and deals 4 damage to all enemies.',
      hooks: [{ on: 'onPlay', filter: { type: 'attack' }, every: 3, fx: [{ op: 'status', s: 'charge', n: 2, tgt: 'self' }, { op: 'dmg', n: 4, tgt: 'all' }] }],
    },

    // ================================================================== RARE (12)
    jade_key: {
      name: 'Jade Key', rarity: 'rare', art: { m: 'key', c: 'jade' },
      text: 'At each camp you may take 1 more action, and a rest also heals both heroes 4 HP.',
      mods: { campActions: 1 },
      hooks: [{ on: 'onRest', fx: [{ op: 'heal', n: 4, who: 'both' }] }],
    },
    branching_bookmark: {
      name: 'Harmony Ribbon', rarity: 'rare', art: { m: 'ribbon', c: 'violet' },
      text: 'Card rewards offer 1 more card.',
      mods: { cardChoices: 1 },
    },
    phoenix_feather: {
      name: 'Phoenix Feather', rarity: 'rare', art: { m: 'feather', c: 'crimson' }, locked: true,
      text: 'The first time a hero falls each fight, revive them with 25% HP.',
      hooks: [{ on: 'onHeroDown', once: true, fx: [{ op: 'revive', pct: 0.25 }] }],
    },
    prism_crown: {
      name: 'Prism Crown', rarity: 'rare', art: { m: 'crown', c: 'gold' }, locked: true,
      text: 'Whenever you play a card with 2 or more gems, gain 1 Energy (once per turn).',
      hooks: [{ on: 'onPlay', filter: { gems: { gte: 2 } }, limit: 1, fx: [{ op: 'energy', n: 1 }] }],
    },
    mirror_of_two_faces: {
      name: 'Mirror of Two Faces', rarity: 'rare', art: { m: 'mirror', c: 'violet' }, locked: true,
      text: 'Whenever you swap rows, gain 1 Energy (once per turn).',
      hooks: [{ on: 'onSwap', limit: 1, fx: [{ op: 'energy', n: 1 }] }],
    },
    formation_scroll: {
      name: 'Marching Cadence', rarity: 'rare', art: { m: 'scroll', c: 'ink' },
      text: 'Front hero starts turns with 3 Block, and the back hero gains 1 extra Block from cards.',
      rows: { front: { startBlock: 3 }, back: { blockAdd: 1 } },
    },
    dragon_pearl: {
      name: 'Dragon Pearl', rarity: 'rare', art: { m: 'dragon', c: 'teal' }, locked: true,
      text: 'Whenever you defeat an Elite, both heroes gain 2 max HP.',
      hooks: [{ on: 'onKill', filter: { tier: 'elite' }, fx: [{ op: 'maxHp', n: 2, tgt: 'both' }] }],
    },
    sands_of_patience: {
      name: 'Sands of Patience', rarity: 'rare', art: { m: 'hourglass', c: 'amber' }, locked: true,
      text: 'Every 3rd turn, gain 1 Energy and draw 1 card.',
      hooks: [{ on: 'turnStart', every: 3, fx: [{ op: 'energy', n: 1 }, { op: 'draw', n: 1 }] }],
    },
    // hero rares
    hundred_petal_fan: {
      name: 'Hundred Petal Fan', rarity: 'rare', hero: 'hanae', art: { m: 'fan', c: 'rose' },
      text: 'Whenever Hanae plays a 0-cost Attack, draw 1 card and gain 1 Bloom (twice a turn).',
      hooks: [{ on: 'onPlay', filter: { type: 'attack', cost: { lte: 0 } }, limit: 2, fx: [{ op: 'draw', n: 1 }, { op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
    },
    nightlong_inkwell: {
      name: 'Nightlong Dirge', rarity: 'rare', hero: 'kuro', art: { m: 'inkstone', c: 'indigo' },
      text: 'At the end of your turn, Kuro applies 2 Poison to all enemies.',
      hooks: [{ on: 'turnEnd', fx: [{ op: 'status', s: 'poison', n: 2, tgt: 'all' }] }],
    },
    lotus_sanctuary: {
      name: 'Lotus Sanctuary', rarity: 'rare', hero: 'suzu', art: { m: 'lotus', c: 'moon' },
      text: 'Suzu gains 1 extra Ward a turn, and at 4 spends them to Weaken all and Block both for 3.',
      hooks: [{ on: 'turnStart', fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }, { op: 'cond', if: { status: { s: 'ward', gte: 4 } }, then: [{ op: 'removeStatus', s: 'ward', n: 4, tgt: 'self' }, { op: 'status', s: 'weak', n: 1, tgt: 'all' }, { op: 'block', n: 3, tgt: 'both' }] }] }],
    },
    stormtiger_sash: {
      name: 'Stormtiger Sash', rarity: 'rare', hero: 'raiga', art: { m: 'tiger', c: 'amber' },
      text: 'Raiga gains 1 Charge when hit, and at 8 Charge he spends it for 10 damage to all enemies.',
      hooks: [{ on: 'onDamaged', fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }, { op: 'cond', if: { status: { s: 'charge', gte: 8 } }, then: [{ op: 'removeStatus', s: 'charge', n: 8, tgt: 'self' }, { op: 'dmg', n: 10, tgt: 'all' }] }] }],
    },

    // ================================================================== BOSS (6): each one is a trade
    tyrants_crown: {
      name: 'Tyrant\'s Crown', rarity: 'boss', art: { m: 'crown', c: 'crimson' },
      text: 'Gain 1 Energy each turn, but taking this adds 3 Curses to your deck.',
      mods: { energy: 1 },
      hooks: [{ on: 'onPickup', fx: [{ op: 'addCurse', n: 3 }] }],
    },
    book_of_falling_leaves: {
      name: 'Song of Falling Leaves', rarity: 'boss', art: { m: 'maple', c: 'amber' },
      text: 'Draw 1 more card each turn, but healing outside combat is 40% weaker.',
      mods: { hand: 1, healMul: -0.4 },
    },
    blood_moon_vow: {
      name: 'Blood Moon Vow', rarity: 'boss', art: { m: 'moon', c: 'violet' },
      text: 'Gain 1 Energy each turn, but both heroes lose 2 HP at the start of your turn.',
      mods: { energy: 1 },
      hooks: [{ on: 'turnStart', fx: [{ op: 'hurt', n: 2, tgt: 'both' }] }],
    },
    toll_bridge: {
      name: 'Toll Bridge', rarity: 'boss', art: { m: 'bridge', c: 'gold' },
      text: 'Taking this gives a tier 3 gem and 2 more cards per reward, but shop prices rise 25%.',
      mods: { cardChoices: 2, priceMul: 0.25 },
      hooks: [{ on: 'onPickup', fx: [{ op: 'addGem', tier: 3 }] }],
    },
    ironclad_tsuba: {
      name: 'Ironclad Tsuba', rarity: 'boss', art: { m: 'katana_guard', c: 'ash' },
      text: 'Heroes gain 2 Block each turn and start fights with 3 Thorns, but you draw 1 fewer card.',
      mods: { startBlock: 2, hand: -1 },
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'thorns', n: 3, tgt: 'both' }] }],
    },
    bottomless_gourd: {
      name: 'Bottomless Gourd', rarity: 'boss', art: { m: 'gourd', c: 'teal' }, locked: true,
      text: 'Both heroes start each fight with 3 Might, but also with 2 Vulnerable.',
      hooks: [{ on: 'combatStart', fx: [{ op: 'status', s: 'might', n: 3, tgt: 'both' }, { op: 'status', s: 'vulnerable', n: 2, tgt: 'both' }] }],
    },

    // ================================================================== SHOP (4): sold for 160 gold, nowhere else
    fox_haggler_token: {
      name: 'Fox Haggler\'s Token', rarity: 'shop', art: { m: 'fox', c: 'amber' },
      text: 'All shop prices are 20% lower.',
      mods: { priceMul: -0.2 },
    },
    merchants_seal: {
      name: 'Merchant\'s Seal', rarity: 'shop', art: { m: 'seal', c: 'crimson' },
      text: 'After every fight, gain 8 gold.',
      hooks: [{ on: 'onFightWon', fx: [{ op: 'gold', n: 8 }] }],
    },
    apothecary_jar: {
      name: 'Apothecary Jar', rarity: 'shop', art: { m: 'jar', c: 'jade' },
      text: 'At the end of each fight you win, both heroes heal 3 HP.',
      hooks: [{ on: 'combatEnd', fx: [{ op: 'heal', n: 3, tgt: 'both' }] }],
    },
    pearl_satchel: {
      name: 'Pearl Diver\'s Satchel', rarity: 'shop', art: { m: 'shell', c: 'azure' }, locked: true,
      text: 'When you enter a shop, gain a random tier 1 gem.',
      hooks: [{ on: 'onShopEnter', fx: [{ op: 'addGem', tier: 1 }] }],
    },
  };

  DATA.add('relics', relics);
})();
