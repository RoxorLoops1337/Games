// Inkwoven -- data core: registries, closed vocabularies, statuses, keywords,
// economy, heroes, brushes, tiles, and the structural validator.
//
// This file is the machine-readable half of the contract (DESIGN.md is the human
// half). Content files (data_cards_*.js, data_enemies_*.js, ...) are IIFEs that
// register into the registries below with DATA.add(kind, defs). Nothing here
// touches the DOM. No em dashes, no Math.random.
const DATA = (() => {
  // ------------------------------------------------------------------
  // Closed vocabularies. Content may only use ids from these lists.
  // ------------------------------------------------------------------
  const LISTS = {
    heroIds: ['hanae', 'kuro', 'suzu', 'raiga'],
    cardTypes: ['attack', 'skill', 'power', 'curse', 'status'],
    rarities: ['starter', 'common', 'uncommon', 'rare', 'token'],   // token: generated in combat, never a reward
    cardKw: ['exhaust', 'retain', 'innate', 'ethereal', 'unplayable'],
    slotColors: ['red', 'blue', 'green', 'gold', 'any'],
    gemColors: ['red', 'blue', 'green', 'gold'],
    gemCuts: ['round', 'oval', 'square', 'drop', 'star'],
    relicRarities: ['common', 'uncommon', 'rare', 'boss', 'shop'],
    chapters: [1, 2, 3],
    tiers: ['minion', 'normal', 'elite', 'boss'],
    sizes: ['s', 'm', 'l', 'xl'],

    // ops usable in each context (see DESIGN.md "Effect DSL")
    cardOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'draw', 'energy', 'pick', 'add', 'swap', 'hurt', 'cond', 'repeat', 'gold', 'ink', 'maxHp'],
    hookOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'draw', 'energy', 'add', 'hurt', 'cond', 'gold', 'ink', 'maxHp'],
    enemyOps: ['dmg', 'block', 'heal', 'status', 'removeStatus', 'add', 'summon', 'swap', 'cond', 'stealGold'],
    runOps: ['gold', 'ink', 'heal', 'hurt', 'maxHp', 'addCard', 'removeCard', 'upgradeCard', 'transformCard', 'duplicateCard', 'addRelic', 'addGem', 'addBrush', 'addCurse', 'fight', 'flag', 'paint', 'cardReward'],

    // target vocabularies
    cardTgt: ['enemy', 'all', 'random', 'lowest', 'self', 'ally', 'both', 'front', 'back'],
    enemyHeroTgt: ['front', 'back', 'both', 'random', 'lowest'],          // enemy ops aimed at heroes
    enemySelfTgt: ['self', 'allEnemies', 'otherEnemy', 'lowestEnemy'],    // enemy ops aimed at enemies
    heroTgt: ['self', 'ally', 'both', 'front', 'back'],                   // card ops aimed at heroes
    enemyCardTgt: ['enemy', 'all', 'random', 'lowest'],                   // card ops aimed at enemies

    // value expression: number, or {base, per, mul, s, who, cap, min}
    per: ['X', 'handSize', 'drawPile', 'discardPile', 'exhaustPile', 'cardsPlayed', 'attacksPlayed', 'skillsPlayed',
      'energy', 'block', 'missingHp', 'status', 'enemies', 'kills', 'turn', 'gems', 'front', 'hp'],
    perWho: ['self', 'ally', 'target', 'enemy'],
    // conditions for the `cond` op (card, hook, enemy fx) and enemy AI rules
    cond: ['row', 'status', 'hpPct', 'handEmpty', 'cardsPlayed', 'attacksPlayed', 'turn', 'lastKill', 'targetStatus',
      'allyDown', 'block', 'energy', 'handSize', 'enemies'],
    aiCond: ['hpLt', 'hpGt', 'turnGte', 'turnEvery', 'alone', 'minions', 'heroStatus', 'heroDown'],
    intents: ['attack', 'multi', 'heavy', 'defend', 'buff', 'debuff', 'summon', 'heal', 'special', 'flee', 'none'],

    // hooks
    combatHooks: ['combatStart', 'combatEnd', 'turnStart', 'turnEnd', 'onPlay', 'onDamaged', 'onKill', 'onSwap', 'onHeroDown', 'onShuffle', 'onExhaust'],
    runHooks: ['onPickup', 'onChapterStart', 'onRest', 'onPaint', 'onFightWon', 'onShopEnter'],
    hookFilter: ['type', 'hero', 'cost', 'kw'],
    cardPickFrom: ['hand', 'draw', 'discard', 'exhaust'],
    cardPickThen: ['discard', 'exhaust', 'retain', 'upgrade', 'toHand', 'toDrawTop', 'copy'],
    addTo: ['hand', 'draw', 'discard', 'exhaust'],

    // static numeric modifiers (relics, gems on relics? no: relics/trials/hero rows)
    mods: ['energy', 'hand', 'startBlock', 'inkMax', 'startInk', 'goldMul', 'priceMul', 'healMul', 'cardChoices', 'rareBoost', 'freeSwaps', 'maxHpPct'],
    trialMods: ['enemyHp', 'eliteHp', 'bossHp', 'enemyDmg', 'goldMul', 'healMul', 'startInk', 'reviveFrac', 'cardChoices', 'priceMul', 'curses', 'startGold', 'wellInk'],
    rowFields: ['dmgAdd', 'blockAdd', 'startBlock', 'regen', 'thorns', 'drawAdd'],
    gemModKeys: ['dmg', 'block', 'heal', 'hits', 'cost', 'draw', 'energy', 'poison', 'status', 'fx', 'kw', 'kwRemove', 'cond'],

    // stat counters tracked per run in R.stats (RUN, merged from COMBAT stats) and per profile (META.recordRun).
    // statMax keys merge with max(), every other key adds. Achievements read these.
    statKeys: ['runs', 'wins', 'deaths', 'kills', 'elites', 'bossKills', 'boss1Kills', 'boss2Kills', 'boss3Kills',
      'cardsPlayed', 'attacksPlayed', 'damageDealt', 'damageTaken', 'blockGained', 'maxHit', 'maxTurnDamage', 'turns',
      'hexesPainted', 'brushesUsed', 'wellsDrunk', 'chestsOpened', 'shopsVisited', 'goldEarned', 'goldSpent', 'purchases',
      'campRests', 'upgrades', 'gemsSocketed', 'relicsFound', 'eventsSeen', 'curseCards', 'swaps', 'heroDowns', 'revives',
      'flawlessBosses', 'maxDeck', 'smallDeckWins', 'trialBest', 'dailyRuns', 'winsHanae', 'winsKuro', 'winsSuzu', 'winsRaiga',
      'poisonKills', 'burnKills', 'thornKills', 'multiHitTurns', 'zeroCostTurns'],
    statMax: ['maxHit', 'maxTurnDamage', 'maxDeck', 'trialBest'],

    // map
    tiles: ['start', 'empty', 'block', 'enemy', 'elite', 'boss', 'chest', 'shop', 'camp', 'event', 'well', 'brush', 'gemcache', 'forge'],
    landmarks: ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'],       // visible as dim silhouettes in the fog
    brushKinds: ['line', 'fan', 'blob', 'ring', 'dot'],

    // presentation vocab (art and audio agents implement exactly these)
    scenes: ['title', 'ch1', 'ch2', 'ch3', 'boss1', 'boss2', 'boss3', 'camp', 'shop', 'event', 'treasure', 'victory', 'defeat', 'paper'],
    palettes: ['rose', 'crimson', 'amber', 'gold', 'jade', 'teal', 'azure', 'indigo', 'violet', 'ink', 'moon', 'ash'],
    poses: ['idle', 'attack', 'cast', 'hurt', 'block', 'down', 'cheer', 'walk'],
    enemyPoses: ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'],
    motifs: ['slash', 'cross_slash', 'thrust', 'crescent', 'iai', 'petals', 'bloom', 'petal_storm', 'wind', 'shield', 'barrier',
      'talisman', 'lotus', 'moon', 'sun', 'star', 'lightning', 'thunder_fist', 'chain_lightning', 'fire', 'flame_orb', 'ice',
      'ink_splash', 'ink_wave', 'brush_stroke', 'calligraphy', 'scroll', 'eye', 'mask', 'fan', 'bell', 'lantern', 'koi',
      'dragon', 'tiger', 'crane', 'fox', 'web', 'thorns', 'poison_bloom', 'skull', 'heal_light', 'spirit_orb', 'torii',
      'mirror', 'sword_rain', 'meteor', 'wave', 'tornado', 'quake', 'fist', 'kick', 'arrow', 'coin', 'key', 'book', 'quill',
      'void', 'sigil'],
    relicIcons: ['lantern', 'mask', 'fan', 'bell', 'key', 'scroll', 'coin', 'jar', 'geta', 'kasa', 'incense', 'mirror', 'comb',
      'dice', 'drum', 'flute', 'brush', 'inkstone', 'seal', 'umbrella', 'charm', 'riceball', 'teacup', 'koi', 'feather', 'crown',
      'hourglass', 'compass', 'candle', 'ribbon', 'sword', 'katana_guard', 'bow', 'beads', 'gourd', 'lotus', 'moon', 'sun', 'star',
      'dragon', 'tiger', 'crane', 'fox', 'skull', 'eye', 'heart', 'tooth', 'shell', 'bamboo', 'plum', 'maple', 'shrine', 'bridge',
      'petal', 'flame', 'snowflake', 'bolt', 'ink_drop'],
    sfx: ['ui_click', 'ui_hover', 'ui_back', 'ui_error', 'ui_open', 'ui_close', 'ui_toggle',
      'card_draw', 'card_hover', 'card_pick', 'card_play_attack', 'card_play_skill', 'card_play_power', 'card_discard', 'card_exhaust', 'shuffle',
      'swap', 'energy_gain', 'turn_start', 'turn_end', 'enemy_turn',
      'hit_light', 'hit_heavy', 'hit_crit', 'hit_multi', 'slash', 'thud', 'zap', 'flame', 'ice', 'poison_tick', 'thorn', 'dodge',
      'block_gain', 'block_hit', 'block_break', 'heal', 'buff', 'debuff', 'stun',
      'enemy_die', 'hero_down', 'hero_revive', 'boss_die', 'boss_intro', 'phase_change',
      'paint', 'ink_splash', 'brush_pick', 'brush_use', 'step', 'reveal_landmark', 'ink_gain', 'well',
      'gold', 'buy', 'chest_open', 'relic_get', 'gem_socket', 'gem_get', 'forge_hit', 'upgrade', 'camp_fire', 'rest', 'event_open', 'choice',
      'page_turn', 'level_up', 'victory', 'defeat', 'achievement', 'unlock', 'save'],
    music: ['title', 'hero_select', 'map1', 'map2', 'map3', 'combat1', 'combat2', 'combat3', 'elite', 'boss1', 'boss2', 'boss3', 'final',
      'shop', 'camp', 'event', 'reward', 'victory', 'defeat'],
  };

  // ------------------------------------------------------------------
  // Statuses. Semantics are implemented by COMBAT; text is what the UI shows.
  // stack: 'int' = intensity (numbers add), 'dur' = duration in rounds (numbers add).
  // resource statuses are inert: cards and passives read and spend them.
  // ------------------------------------------------------------------
  const statuses = {
    might:      { id: 'might', name: 'Might', kind: 'buff', stack: 'int', text: 'Attacks deal +N damage per hit.' },
    bulwark:    { id: 'bulwark', name: 'Bulwark', kind: 'buff', stack: 'int', text: 'Gain +N extra Block whenever you gain Block.' },
    regen:      { id: 'regen', name: 'Regen', kind: 'buff', stack: 'int', text: 'At the start of its turn, heal N, then Regen falls by 1.' },
    thorns:     { id: 'thorns', name: 'Thorns', kind: 'buff', stack: 'int', text: 'Whenever it is hit by an attack, the attacker takes N damage.' },
    dodge:      { id: 'dodge', name: 'Dodge', kind: 'buff', stack: 'int', text: 'Negates the next N attack hits completely.' },
    taunt:      { id: 'taunt', name: 'Taunt', kind: 'buff', stack: 'dur', text: 'Enemy attacks that would strike the back row, or a random or lowest hero, hit this hero instead.' },
    ritual:     { id: 'ritual', name: 'Ritual', kind: 'buff', stack: 'int', text: 'At the start of the enemy phase, gain N Might.' },
    plating:    { id: 'plating', name: 'Plating', kind: 'buff', stack: 'int', text: 'At the start of its turn, gain N Block.' },
    bloom:      { id: 'bloom', name: 'Bloom', kind: 'resource', stack: 'int', hero: 'hanae', text: 'Hanae\'s petals. Built by her attacks, spent by her finishers.' },
    sumi:       { id: 'sumi', name: 'Sumi', kind: 'resource', stack: 'int', hero: 'kuro', text: 'Kuro\'s ink charge. Built by his skills, poured into his spells.' },
    ward:       { id: 'ward', name: 'Ward', kind: 'resource', stack: 'int', hero: 'suzu', text: 'Suzu\'s talisman charges. Built by her prayers, spent by her rites.' },
    charge:     { id: 'charge', name: 'Charge', kind: 'resource', stack: 'int', hero: 'raiga', text: 'Raiga\'s static. Built by taking hits and striking, released in storms.' },
    vulnerable: { id: 'vulnerable', name: 'Vulnerable', kind: 'debuff', stack: 'dur', text: 'Takes 50% more attack damage.' },
    weak:       { id: 'weak', name: 'Weak', kind: 'debuff', stack: 'dur', text: 'Deals 25% less attack damage.' },
    frail:      { id: 'frail', name: 'Frail', kind: 'debuff', stack: 'dur', text: 'Gains 25% less Block.' },
    poison:     { id: 'poison', name: 'Poison', kind: 'debuff', stack: 'int', text: 'At the start of its turn, lose N HP (ignores Block), then Poison falls by 1.' },
    burn:       { id: 'burn', name: 'Burn', kind: 'debuff', stack: 'int', text: 'At the end of the round, take N damage (ignores Block), then Burn halves.' },
    stun:       { id: 'stun', name: 'Stun', kind: 'debuff', stack: 'dur', text: 'Skips its next action. A stunned hero cannot play cards next turn.' },
    bind:       { id: 'bind', name: 'Bind', kind: 'debuff', stack: 'dur', text: 'This hero cannot swap rows.' },
    mark:       { id: 'mark', name: 'Mark', kind: 'debuff', stack: 'int', text: 'The next N attack hits deal +3 damage each (one stack per hit).' },
  };

  // Glossary shown in tooltips. Keys are the words the UI highlights in card text.
  const keywords = {
    block: { name: 'Block', text: 'Absorbs damage this turn. Wears off at the start of the owner\'s next turn.' },
    exhaust: { name: 'Exhaust', text: 'Removed from your deck for the rest of this combat after it is played.' },
    retain: { name: 'Retain', text: 'Stays in your hand at the end of the turn.' },
    innate: { name: 'Innate', text: 'Always in your opening hand.' },
    ethereal: { name: 'Ethereal', text: 'Exhausted if still in your hand at the end of the turn.' },
    unplayable: { name: 'Unplayable', text: 'Cannot be played.' },
    front: { name: 'Front row', text: 'The hero in front takes most enemy attacks. Many cards and heroes change when in front.' },
    back: { name: 'Back row', text: 'Safe from most attacks. Many cards and heroes change when in back.' },
    swap: { name: 'Swap', text: 'Trade rows. One swap per turn is free, more cost 1 Energy.' },
    ink: { name: 'Ink', text: 'Spend Ink on the map to paint a hex and reveal it.' },
    brush: { name: 'Brush', text: 'A one-use brush that paints a shape of hexes for free.' },
    gem: { name: 'Gem', text: 'Socket gems into card slots. A slot only accepts its own colour, prism slots accept any.' },
    slot: { name: 'Gem slot', text: 'Colour-matched socket. Gems change how the card plays.' },
    down: { name: 'Downed', text: 'A hero at 0 HP is downed: their cards are dead and they cannot be targeted. If both fall, the tale ends.' },
  };

  // ------------------------------------------------------------------
  // Economy: every tunable number in one place. RUN and MAP read these.
  // ------------------------------------------------------------------
  const ECONOMY = {
    energy: 3, handSize: 5, maxHand: 10, freeSwaps: 1, swapCost: 1,
    startGold: 60, startInk: 8, inkMax: 12, paintCost: 1,
    wellInk: 3, campInk: 4,
    killInk: { minion: 0, normal: 1, elite: 2, boss: 0 },
    gold: { normal: [14, 22], elite: [30, 44], boss: [70, 90], chest: [45, 75] },
    cardChoices: 3,
    // rarity weights (percent) for card rewards; 'rareOffset' rises by 1 per non-rare reward and resets on a rare
    rarity: {
      normal: { common: 62, uncommon: 33, rare: 5 },
      elite: { common: 45, uncommon: 40, rare: 15 },
      boss: { common: 0, uncommon: 0, rare: 100 },
      shop: { common: 55, uncommon: 35, rare: 10 },
    },
    relicWeights: { elite: { common: 50, uncommon: 40, rare: 10 }, chest: { common: 45, uncommon: 40, rare: 15 }, shop: { common: 40, uncommon: 40, rare: 20 } },
    price: { card: { common: 50, uncommon: 80, rare: 150 }, relic: { common: 140, uncommon: 190, rare: 260, shop: 160 }, gem: { 1: 60, 2: 110, 3: 180 }, remove: 75, removeStep: 25, brush: 45, saleFrac: 0.5 },
    shop: { cards: 5, gems: 2, relics: 3, brushes: 1 },
    camp: { restPct: 0.35 },
    chapterEnd: { healPct: 0.30, maxHp: 8 },
    reviveFrac: 0.25,                 // downed heroes revive at this fraction of max HP when a fight is won
    // map generation targets (fractions of non-block hexes) and counts
    map: { cols: 21, rows: 13, hexSize: 46, blockFrac: 0.12, startRing: 2 },
    dist: { enemy: 0.22, elite: 0.04, chest: 0.05, shop: 0.03, camp: 0.04, event: 0.12, well: 0.08, brush: 0.04, gemcache: 0.04, forge: 0.03 },
    distMin: { elite: 2, chest: 2, shop: 2, camp: 3, event: 6, well: 4, brush: 2, gemcache: 2, forge: 2 },
    distMax: { elite: 5 },
  };

  // ------------------------------------------------------------------
  // Brushes: one-use map tools. MAP.brushCells implements the geometry.
  // ------------------------------------------------------------------
  const brushes = {
    stroke: { id: 'stroke', name: 'Long Stroke', kind: 'line', len: 3, text: 'Paint 3 hexes in a straight line, starting next to any painted hex.' },
    wave:   { id: 'wave', name: 'Wave Sweep', kind: 'line', len: 5, text: 'Paint 5 hexes in a straight line, starting next to any painted hex.' },
    fan:    { id: 'fan', name: 'Fan Brush', kind: 'fan', text: 'Paint a wedge of 3 hexes next to a painted hex.' },
    splash: { id: 'splash', name: 'Ink Splash', kind: 'blob', text: 'Paint a hex next to the painted area and the 6 hexes around it.' },
    halo:   { id: 'halo', name: 'Halo Ring', kind: 'ring', text: 'Paint all 6 hexes around any painted hex.' },
    blot:   { id: 'blot', name: 'Quick Blot', kind: 'dot', text: 'Paint any one hex within 4 of the party.' },
  };

  // Map tile presentation names (icons come from ART.icon 'tile').
  const tiles = {
    start: { name: 'Bookmark', text: 'Where the tale begins.' },
    empty: { name: 'Path', text: 'Open ground.' },
    block: { name: 'Unwritten Void', text: 'A hole in the story. Nothing can cross it.' },
    enemy: { name: 'Ambush', text: 'A creature of the tale blocks the way.' },
    elite: { name: 'Champion', text: 'A dangerous foe guarding a treasure.' },
    boss: { name: 'Chapter Boss', text: 'The keeper of this chapter.' },
    chest: { name: 'Treasure', text: 'A chest. Relics, gold, or gems.' },
    shop: { name: 'Peddler', text: 'A travelling merchant of odd things.' },
    camp: { name: 'Campfire', text: 'Rest, mend, or sharpen.' },
    event: { name: 'Fable', text: 'Something strange is happening.' },
    well: { name: 'Ink Well', text: 'Refills your Ink.' },
    brush: { name: 'Brush Rack', text: 'Take a one-use brush.' },
    gemcache: { name: 'Gem Cache', text: 'Choose a gem.' },
    forge: { name: 'Inkstone Forge', text: 'Upgrade one card.' },
  };

  // ------------------------------------------------------------------
  // Heroes. Rows: the bonus a hero gets while standing in that row.
  // passives use the hook DSL (same shape as relic hooks). Starter card ids are
  // a promise: the hero's card file MUST define each of them.
  // ------------------------------------------------------------------
  const heroes = {
    hanae: {
      id: 'hanae', name: 'Hanae', title: 'The Blossom Blade', prefer: 'front', res: 'bloom',
      color: '#ff7eb6', accent: '#fff4f8', dark: '#b0245c', maxHp: 76,
      blurb: 'A duelist who never loses her composure. She cuts fast and cuts often, and blooms brighter with every strike.',
      rows: { front: { dmgAdd: 2 }, back: { blockAdd: 1 } },
      passives: [{ id: 'blade_flow', name: 'Blade Flow', on: 'onPlay', filter: { type: 'attack' }, limit: 1, fx: [{ op: 'status', s: 'bloom', n: 1, tgt: 'self' }] }],
      starter: ['hanae_slash', 'hanae_slash', 'hanae_parry', 'hanae_parry', 'hanae_petal_step'],
      unlock: null,
    },
    kuro: {
      id: 'kuro', name: 'Kuro', title: 'The Inkweaver', prefer: 'back', res: 'sumi',
      color: '#7a6bff', accent: '#5ff5ff', dark: '#1a1740', maxHp: 60,
      blurb: 'A calligrapher who writes spells into the air. Fragile up close, devastating when the page is his to fill.',
      rows: { back: { dmgAdd: 2 }, front: { blockAdd: 0 } },
      passives: [{ id: 'steady_hand', name: 'Steady Hand', on: 'onPlay', filter: { type: 'skill' }, limit: 1, fx: [{ op: 'status', s: 'sumi', n: 1, tgt: 'self' }] }],
      starter: ['kuro_ink_bolt', 'kuro_ink_bolt', 'kuro_ink_ward', 'kuro_ink_ward', 'kuro_first_stroke'],
      unlock: null,
    },
    suzu: {
      id: 'suzu', name: 'Suzu', title: 'The Moon Miko', prefer: 'back', res: 'ward',
      color: '#a9c4ff', accent: '#e8424f', dark: '#4a5c9c', maxHp: 68,
      blurb: 'A shrine maiden who keeps the tale from fraying. Her talismans turn the tide of any fight.',
      rows: { front: { blockAdd: 1, thorns: 2 }, back: { regen: 2 } },
      passives: [{ id: 'moonlit_rite', name: 'Moonlit Rite', on: 'turnStart', fx: [{ op: 'status', s: 'ward', n: 1, tgt: 'self' }] }],
      starter: ['suzu_ofuda', 'suzu_ofuda', 'suzu_barrier', 'suzu_barrier', 'suzu_moon_prayer'],
      unlock: { ach: 'ch1_clear' },
    },
    raiga: {
      id: 'raiga', name: 'Raiga', title: 'The Thunder Monk', prefer: 'front', res: 'charge',
      color: '#ff9a2e', accent: '#ffe45e', dark: '#5a2a0a', maxHp: 88,
      blurb: 'A wandering monk who trades blows with storms. Every hit he takes is one he gives back, louder.',
      rows: { front: { thorns: 2, startBlock: 3 }, back: { dmgAdd: 1 } },
      passives: [{ id: 'storm_born', name: 'Storm Born', on: 'onDamaged', limit: 2, fx: [{ op: 'status', s: 'charge', n: 1, tgt: 'self' }] }],
      starter: ['raiga_jab', 'raiga_jab', 'raiga_brace', 'raiga_brace', 'raiga_static_fist'],
      unlock: { ach: 'ch2_clear' },
    },
  };

  // ------------------------------------------------------------------
  // Registries filled by content files. DATA.add throws on a duplicate id so two
  // agents can never silently shadow each other.
  // ------------------------------------------------------------------
  const REG = ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'tips', 'lore'];
  const D = { LISTS, statuses, keywords, ECONOMY, brushes, tiles, heroes, encounters: { 1: { normal: [], elite: [] }, 2: { normal: [], elite: [] }, 3: { normal: [], elite: [] } } };
  REG.forEach((k) => { D[k] = k === 'tips' ? [] : {}; });

  D.add = (kind, defs) => {
    if (!D[kind] || REG.indexOf(kind) < 0) throw new Error('DATA.add: unknown registry ' + kind);
    if (kind === 'tips') { (Array.isArray(defs) ? defs : [defs]).forEach((t) => D.tips.push(t)); return; }
    Object.keys(defs).forEach((id) => {
      if (D[kind][id]) throw new Error(`DATA.add: duplicate ${kind} id "${id}"`);
      const d = defs[id];
      if (d && typeof d === 'object' && !d.id) d.id = id;
      if (d && d.id !== id) throw new Error(`DATA.add: ${kind} key "${id}" != def id "${d.id}"`);
      D[kind][id] = d;
    });
  };

  // Encounter pools: DATA.addEncounters(chapter, {normal:[{id, enemies:[ids], w, min}], elite:[...], boss:'id'})
  // min = lowest tile.diff (0..1) the group may appear at; w = weight.
  D.addEncounters = (chapter, pools) => {
    const e = D.encounters[chapter];
    if (!e) throw new Error('DATA.addEncounters: bad chapter ' + chapter);
    ['normal', 'elite'].forEach((k) => { if (pools[k]) e[k].push(...pools[k]); });
    if (pools.boss) { if (e.boss) throw new Error('DATA.addEncounters: boss already set for chapter ' + chapter); e.boss = pools.boss; }
  };

  // ---- lookups ----
  D.hero = (id) => heroes[id] || null;
  D.card = (id) => D.cards[id] || null;
  D.cardsBy = (f) => Object.values(D.cards).filter((c) => (!f.hero || c.hero === f.hero) && (!f.rarity || c.rarity === f.rarity) && (!f.type || c.type === f.type));
  // Reward pool for one hero at one rarity (starters and tokens never reward)
  D.rewardPool = (heroId, rarity) => D.cardsBy({ hero: heroId, rarity });
  D.enemyIds = (chapter, tier) => Object.values(D.enemies).filter((e) => (!chapter || e.chapter === chapter) && (!tier || e.tier === tier)).map((e) => e.id);
  D.isStatus = (id) => !!statuses[id];

  // ------------------------------------------------------------------
  // Validator. Structural only: shapes, closed lists, cross references. It never
  // simulates. Returns {errors:[], warnings:[], counts:{}}. Content agents run
  // DATA.validate() and fix everything in their own registry to zero errors.
  // ------------------------------------------------------------------
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const has = (list, v) => LISTS[list].indexOf(v) >= 0;
  const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');

  D.validate = (only) => {
    const errors = [], warnings = [];
    const err = (where, msg) => errors.push(`${where}: ${msg}`);
    const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
    const want = (k) => !only || only === k || (Array.isArray(only) && only.indexOf(k) >= 0);

    // value expression
    const vVal = (w, v, path) => {
      if (isNum(v)) return;
      if (v && typeof v === 'object') {
        Object.keys(v).forEach((k) => { if (['base', 'per', 'mul', 's', 'who', 'cap', 'min'].indexOf(k) < 0) err(w, `${path}: unknown value key "${k}"`); });
        if (v.per !== undefined && !has('per', v.per)) err(w, `${path}: bad per "${v.per}"`);
        if (v.per === 'status') { if (!D.isStatus(v.s)) err(w, `${path}: per status needs a known s`); if (v.who && !has('perWho', v.who)) err(w, `${path}: bad who "${v.who}"`); }
        ['base', 'mul', 'cap', 'min'].forEach((k) => { if (v[k] !== undefined && !isNum(v[k])) err(w, `${path}.${k} must be a number`); });
        if (v.per === undefined && v.base === undefined) err(w, `${path}: value object needs base or per`);
        return;
      }
      err(w, `${path}: value must be a number or {base,per,mul,...}`);
    };
    const vCond = (w, c, path, ai) => {
      if (!c || typeof c !== 'object') return err(w, `${path}: condition must be an object`);
      Object.keys(c).forEach((k) => {
        if (!(ai ? has('aiCond', k) : has('cond', k))) err(w, `${path}: unknown condition "${k}"`);
      });
      if (c.row !== undefined && ['front', 'back'].indexOf(c.row) < 0) err(w, `${path}.row must be front or back`);
      if (c.status !== undefined) { if (!c.status || !D.isStatus(c.status.s)) err(w, `${path}.status.s must be a known status`); }
      if (c.targetStatus !== undefined && !(c.targetStatus && D.isStatus(c.targetStatus.s))) err(w, `${path}.targetStatus.s must be a known status`);
      if (c.heroStatus !== undefined && !(c.heroStatus && D.isStatus(c.heroStatus.s))) err(w, `${path}.heroStatus.s must be a known status`);
    };
    // ops: ctx one of card|hook|enemy
    const vOps = (w, ops, ctx, path) => {
      if (!Array.isArray(ops)) return err(w, `${path}: fx must be an array`);
      const allowed = ctx === 'card' ? LISTS.cardOps : ctx === 'hook' ? LISTS.hookOps : LISTS.enemyOps;
      ops.forEach((o, i) => {
        const p = `${path}[${i}]`;
        if (!o || typeof o !== 'object' || !isStr(o.op)) return err(w, `${p}: op object with "op" required`);
        if (allowed.indexOf(o.op) < 0) return err(w, `${p}: op "${o.op}" not allowed in ${ctx} context`);
        const heroSet = ctx === 'enemy' ? LISTS.enemyHeroTgt.concat(LISTS.enemySelfTgt) : ctx === 'card' ? LISTS.cardTgt : LISTS.heroTgt.concat(LISTS.enemyCardTgt);
        if (o.tgt !== undefined && heroSet.indexOf(o.tgt) < 0) err(w, `${p}: tgt "${o.tgt}" not valid in ${ctx} context`);
        switch (o.op) {
          case 'dmg': vVal(w, o.n, p + '.n'); if (o.hits !== undefined) vVal(w, o.hits, p + '.hits'); if (o.consume !== undefined && !D.isStatus(o.consume)) err(w, `${p}.consume unknown status`); break;
          case 'block': case 'heal': case 'hurt': case 'draw': case 'energy': case 'gold': case 'ink': case 'maxHp': case 'stealGold': vVal(w, o.n, p + '.n'); break;
          case 'status': if (!D.isStatus(o.s)) err(w, `${p}: unknown status "${o.s}"`); vVal(w, o.n, p + '.n'); break;
          case 'removeStatus': if (['debuffs', 'buffs'].indexOf(o.s) < 0 && !D.isStatus(o.s)) err(w, `${p}: removeStatus s must be a status id, debuffs or buffs`); break;
          case 'pick':
            if (!has('cardPickFrom', o.from)) err(w, `${p}: bad pick.from`);
            if (!has('cardPickThen', o.then)) err(w, `${p}: bad pick.then`);
            vVal(w, o.n, p + '.n'); break;
          case 'add': if (!isStr(o.card)) err(w, `${p}: add needs card id`); if (o.to !== undefined && !has('addTo', o.to)) err(w, `${p}: bad add.to`); if (o.n !== undefined) vVal(w, o.n, p + '.n'); break;
          case 'summon': if (!isStr(o.enemy)) err(w, `${p}: summon needs enemy id`); break;
          case 'swap': break;
          case 'cond': vCond(w, o.if, p + '.if', false); vOps(w, o.then, ctx, p + '.then'); if (o.else) vOps(w, o.else, ctx, p + '.else'); break;
          case 'repeat': vVal(w, o.n, p + '.n'); vOps(w, o.do, ctx, p + '.do'); break;
        }
      });
    };
    const vHooks = (w, list, path) => {
      if (!Array.isArray(list)) return err(w, `${path} must be an array`);
      list.forEach((h, i) => {
        const p = `${path}[${i}]`;
        if (!h || !isStr(h.on)) return err(w, `${p}: hook needs "on"`);
        if (!has('combatHooks', h.on) && !has('runHooks', h.on)) err(w, `${p}: unknown hook "${h.on}"`);
        if (h.filter) Object.keys(h.filter).forEach((k) => { if (!has('hookFilter', k)) err(w, `${p}.filter: unknown key "${k}"`); });
        if (has('runHooks', h.on)) vRun(w, h.fx, p + '.fx'); else vOps(w, h.fx, 'hook', p + '.fx');
      });
    };
    const vRun = (w, ops, path) => {
      if (!Array.isArray(ops)) return err(w, `${path}: run fx must be an array`);
      ops.forEach((o, i) => {
        const p = `${path}[${i}]`;
        if (!o || !has('runOps', o.op)) return err(w, `${p}: unknown run op "${o && o.op}"`);
        if (['gold', 'ink', 'heal', 'hurt', 'maxHp', 'paint'].indexOf(o.op) >= 0 && !isNum(o.n) && !isNum(o.pct)) err(w, `${p}: ${o.op} needs n (or pct)`);
        if (o.op === 'addRelic' && !o.id && !o.rarity) err(w, `${p}: addRelic needs id or rarity`);
        if (o.op === 'addCard' && !o.card && !o.pool) err(w, `${p}: addCard needs card or pool`);
        if (o.op === 'addBrush' && o.id && !brushes[o.id] && o.id !== 'random') err(w, `${p}: unknown brush "${o.id}"`);
        if (o.op === 'fight' && !o.enc && !o.enemies) err(w, `${p}: fight needs enc or enemies`);
      });
    };
    const vMods = (w, mods, list, path) => {
      Object.keys(mods).forEach((k) => { if (LISTS[list].indexOf(k) < 0) err(w, `${path}: unknown mod "${k}"`); else if (!isNum(mods[k])) err(w, `${path}.${k} must be a number`); });
    };
    const noDash = (w, o) => { if (DASH.test(JSON.stringify(o))) err(w, 'contains an em or en dash'); };

    // ---- heroes ----
    if (want('heroes')) {
      LISTS.heroIds.forEach((id) => {
        const h = heroes[id]; const w = 'hero ' + id;
        if (!h) return err(w, 'missing');
        if (!isNum(h.maxHp) || h.maxHp < 30) err(w, 'maxHp');
        if (!D.statuses[h.res]) err(w, 'res must be a resource status');
        Object.keys(h.rows).forEach((r) => { Object.keys(h.rows[r]).forEach((f) => { if (!has('rowFields', f)) err(w, `rows.${r}.${f} unknown`); }); });
        vHooks(w, h.passives.map((p) => Object.assign({}, p)), 'passives');
        if (!Array.isArray(h.starter) || h.starter.length !== 5) err(w, 'starter must list exactly 5 card ids');
      });
    }

    // ---- cards ----
    if (want('cards')) {
      Object.values(D.cards).forEach((c) => {
        const w = 'card ' + c.id;
        if (!isStr(c.name)) err(w, 'name');
        if (!has('cardTypes', c.type)) err(w, 'type');
        if (!has('rarities', c.rarity)) err(w, 'rarity');
        if (c.hero !== 'curse' && c.hero !== 'status' && !has('heroIds', c.hero)) err(w, `hero "${c.hero}" (use a hero id, or curse or status)`);
        if (!(c.cost === 'X' || (isNum(c.cost) && c.cost >= 0 && c.cost <= 5) || (c.type === 'curse' || c.type === 'status'))) err(w, 'cost must be 0..5 or "X"');
        vOps(w, c.fx || [], 'card', 'fx');
        if (c.up) {
          if (c.up.fx) vOps(w, c.up.fx, 'card', 'up.fx');
          else if (c.type !== 'curse' && c.type !== 'status' && c.rarity !== 'token' && c.up.cost === undefined && !c.up.kw) err(w, 'up must change fx, cost or kw');
        } else if (c.type !== 'curse' && c.type !== 'status' && c.rarity !== 'token') err(w, 'missing up (every playable non-token card needs an upgrade)');
        (c.kw || []).forEach((k) => { if (!has('cardKw', k)) err(w, `unknown keyword "${k}"`); });
        (c.slots || []).forEach((s) => { if (!has('slotColors', s)) err(w, `bad slot colour "${s}"`); });
        if ((c.slots || []).length > 3) err(w, 'at most 3 slots');
        if (!c.art || !has('motifs', c.art.m)) err(w, `art.m "${c.art && c.art.m}" not in LISTS.motifs`);
        if (c.art && c.art.c && !has('palettes', c.art.c)) err(w, `art.c "${c.art.c}" not in LISTS.palettes`);
        if (c.hand) { Object.keys(c.hand).forEach((k) => { if (['turnEnd', 'drawn'].indexOf(k) < 0) err(w, `hand.${k} unknown`); else vOps(w, c.hand[k], 'hook', 'hand.' + k); }); }
        if (c.type === 'attack' && !(c.fx || []).some(function has1(o) { return o.op === 'dmg' || (o.op === 'cond' && (o.then || []).some(has1)) || (o.op === 'repeat' && (o.do || []).some(has1)); })) warn(w, 'attack card has no dmg op');
        noDash(w, c);
      });
      LISTS.heroIds.forEach((id) => { new Set(heroes[id].starter).forEach((cid) => { if (!D.cards[cid]) err('hero ' + id, `starter card "${cid}" is not defined`); }); });
    }

    // ---- gems ----
    if (want('gems')) {
      Object.values(D.gems).forEach((g) => {
        const w = 'gem ' + g.id;
        if (!isStr(g.name)) err(w, 'name');
        if (!has('gemColors', g.color)) err(w, 'color');
        if ([1, 2, 3].indexOf(g.tier) < 0) err(w, 'tier must be 1..3');
        if (!g.art || !has('gemCuts', g.art.cut)) err(w, 'art.cut');
        if (!g.mod || typeof g.mod !== 'object') return err(w, 'mod');
        Object.keys(g.mod).forEach((k) => { if (!has('gemModKeys', k)) err(w, `mod.${k} unknown`); });
        if (g.mod.fx) vOps(w, g.mod.fx, 'card', 'mod.fx');
        if (g.mod.status && !D.isStatus(g.mod.status.s)) err(w, 'mod.status.s unknown status');
        if (g.mod.cond !== undefined && ['front', 'back'].indexOf(g.mod.cond) < 0) err(w, 'mod.cond must be front or back');
        noDash(w, g);
      });
    }

    // ---- relics ----
    if (want('relics')) {
      Object.values(D.relics).forEach((r) => {
        const w = 'relic ' + r.id;
        if (!isStr(r.name)) err(w, 'name');
        if (!isStr(r.text)) err(w, 'text');
        if (!has('relicRarities', r.rarity)) err(w, 'rarity');
        if (!r.art || !has('relicIcons', r.art.m)) err(w, `art.m "${r.art && r.art.m}" not in LISTS.relicIcons`);
        if (r.art && r.art.c && !has('palettes', r.art.c)) err(w, 'art.c not in LISTS.palettes');
        if (r.mods) vMods(w, r.mods, 'mods', 'mods');
        if (r.hooks) vHooks(w, r.hooks, 'hooks');
        if (r.hero && !has('heroIds', r.hero)) err(w, 'hero');
        if (!r.mods && !r.hooks) err(w, 'needs mods or hooks');
        noDash(w, r);
      });
    }

    // ---- enemies ----
    if (want('enemies')) {
      Object.values(D.enemies).forEach((e) => {
        const w = 'enemy ' + e.id;
        if (!isStr(e.name)) err(w, 'name');
        if (!has('chapters', e.chapter)) err(w, 'chapter');
        if (!has('tiers', e.tier)) err(w, 'tier');
        if (!has('sizes', e.size)) err(w, 'size');
        if (!Array.isArray(e.hp) || e.hp.length !== 2 || !isNum(e.hp[0]) || e.hp[1] < e.hp[0]) err(w, 'hp must be [min,max]');
        if (!e.moves || !Object.keys(e.moves).length) return err(w, 'moves');
        Object.keys(e.moves).forEach((mid) => {
          const m = e.moves[mid]; const mw = `${w} move ${mid}`;
          if (!isStr(m.name)) err(mw, 'name');
          if (!has('intents', m.kind)) err(mw, `kind "${m.kind}"`);
          vOps(mw, m.fx || [], 'enemy', 'fx');
        });
        const ai = e.ai;
        if (!ai || (!Array.isArray(ai.seq) && !Array.isArray(ai.weighted))) err(w, 'ai needs seq or weighted');
        else {
          const refs = [].concat(ai.open || [], ai.seq || [], (ai.weighted || []).map((x) => x[0]), (ai.rules || []).map((r) => r.do));
          refs.forEach((m) => { if (!e.moves[m]) err(w, `ai references unknown move "${m}"`); });
          (ai.rules || []).forEach((r, i) => vCond(w, r.if, `ai.rules[${i}].if`, true));
        }
        (e.phases || []).forEach((p, i) => { if (!isNum(p.at) || p.at <= 0 || p.at >= 1) err(w, `phases[${i}].at must be in (0,1)`); if (p.fx) vOps(w, p.fx, 'enemy', `phases[${i}].fx`); if (p.ai) { [].concat(p.ai.open || [], p.ai.seq || []).forEach((m) => { if (!e.moves[m]) err(w, `phases[${i}].ai unknown move "${m}"`); }); } });
        if (e.start) vOps(w, e.start, 'enemy', 'start');
        if (!e.art || !isStr(e.art.id)) err(w, 'art.id');
        if (!isStr(e.lore)) warn(w, 'no lore');
        noDash(w, e);
      });
      [1, 2, 3].forEach((ch) => {
        const p = D.encounters[ch];
        [].concat(p.normal, p.elite).forEach((g) => { g.enemies.forEach((id) => { if (!D.enemies[id]) err('encounter ch' + ch, `unknown enemy "${id}" in group ${g.id}`); }); });
        if (p.boss && !D.enemies[p.boss]) err('encounter ch' + ch, `unknown boss "${p.boss}"`);
      });
    }

    // ---- events ----
    if (want('events')) {
      Object.values(D.events).forEach((ev) => {
        const w = 'event ' + ev.id;
        if (!isStr(ev.title) || !isStr(ev.text)) err(w, 'title and text');
        if (!Array.isArray(ev.choices) || ev.choices.length < 1 || ev.choices.length > 4) return err(w, 'choices must be 1..4');
        ev.choices.forEach((c, i) => {
          if (!isStr(c.label)) err(w, `choices[${i}].label`);
          if (!Array.isArray(c.out) || !c.out.length) return err(w, `choices[${i}].out`);
          c.out.forEach((o, j) => { if (!isNum(o.w)) err(w, `choices[${i}].out[${j}].w`); if (!isStr(o.text)) err(w, `choices[${i}].out[${j}].text`); vRun(w, o.ops || [], `choices[${i}].out[${j}].ops`); });
        });
        noDash(w, ev);
      });
    }

    // ---- achievements, trials, unlocks ----
    if (want('achievements')) {
      Object.values(D.achievements).forEach((a) => { const w = 'achievement ' + a.id; if (!isStr(a.name) || !isStr(a.text)) err(w, 'name and text'); if (!a.stat || !has('statKeys', a.stat.k) || !isNum(a.stat.gte)) err(w, 'stat {k in LISTS.statKeys, gte}'); noDash(w, a); });
      LISTS.heroIds.forEach((id) => { const u = heroes[id].unlock; if (u && !D.achievements[u.ach]) err('hero ' + id, `unlock achievement "${u.ach}" not defined`); });
    }
    if (want('trials')) {
      Object.values(D.trials).forEach((t) => { const w = 'trial ' + t.id; if (!isNum(t.level)) err(w, 'level'); if (!isStr(t.name) || !isStr(t.text)) err(w, 'name and text'); vMods(w, t.mods || {}, 'trialMods', 'mods'); noDash(w, t); });
    }

    const counts = {};
    REG.forEach((k) => { counts[k] = Array.isArray(D[k]) ? D[k].length : Object.keys(D[k]).length; });
    return { errors, warnings, counts };
  };

  return D;
})();
